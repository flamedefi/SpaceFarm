#include "../../partial/FA2Api.ligo"
#include "../../partial/IPresale.ligo"
#include "../../partial/PresaleMethods.ligo"

type lottery_config is record [
  bankroll_distribution:  map (nat * nat, nat); //distribution of random numbers against the prize multiplier for bankroll. e.g. [(1, 1978379) -> 0, (1978380, 2400779) -> 2]
  jackpot_distribution:   map (nat * nat, nat); //distribution of random numbers against the jackpot part taken for prize (in percent). e.g. [(1, 1978379) -> 0, (1978380, 2400779) -> 5]
  jackpot_share:          nat; // share of bet going to jackpot, e.g. 20
  bankroll_limit:         nat; // bankroll threshold causing the excess to be burnt
  min_bet:                nat; // minimum bet amount
  max_bet:                nat; // maximum bet amount
]

type random_response is record [
  random:   nat;
  player:   address;
  bet:      nat;
  bet_idx:  nat;
  timestamp: nat;
]

type storage is record [
  admin:                address;
  oracle:               address;
  token:                address;
  bankroll:             nat;
  jackpot:              nat;
  config:               lottery_config;
  pending_bets:         big_map(address, list(nat));
  pending_bet_players:  set(address);
  games_count:          nat;
]

type action is
| Bet of nat
| ChangeAdminAddress of address
| ChangeOracle of address
| IncreaseBankroll of nat
| IncreaseJackpot of nat
| UpdateConfig of lottery_config
| ObtainRandom of list(random_response)

function bet(const bet_amount: nat; var s: storage): list(operation) * storage is
  block {
    if bet_amount < s.config.min_bet or bet_amount > s.config.max_bet then
      failwith("SF_INVALID_BET");
    else
      skip;

    const jackpot_share : nat = bet_amount * s.config.jackpot_share / 100n;
    s.jackpot := s.jackpot + jackpot_share;
    const bankroll_share : nat = abs(bet_amount - jackpot_share);
    var ops : list( operation ) := nil;
    if ((s.bankroll + bankroll_share) > s.config.bankroll_limit) then block {
      s.bankroll := s.config.bankroll_limit;
      //call burn the excess
      ops := Tezos.transaction(
        Burn(record [
          token_id = 0n;
          amount = abs(s.bankroll + bankroll_share - s.config.bankroll_limit);
        ]),
        0mutez,
        get_flame_token_burn_entrypoint(s.token)
      ) # ops;
    }
    else
      s.bankroll := s.bankroll + bankroll_share;
    case s.pending_bets[Tezos.sender] of
    | Some(b) -> s.pending_bets[Tezos.sender] := bet_amount # b
    | None -> s.pending_bets[Tezos.sender] := list [bet_amount]
    end;
    s.pending_bet_players := Set.add(Tezos.sender, s.pending_bet_players);
    for op in list call_transfer_op(record [token = s.token; from_addr = Tezos.sender; to_addr = Tezos.self_address; amount = bet_amount]) block {
        ops:= op # ops;
    }
  } with(ops, s)

function change_admin(const new_admin: address; var s: storage): storage is
  block {
    if Tezos.sender =/= s.admin then
      failwith("SF_DENIED")
    else
      s.admin := new_admin;
  } with(s)

function change_oracle(const new_oracle: address; var s: storage): storage is
  block {
    if Tezos.sender =/= s.admin then
      failwith("SF_DENIED")
    else
      s.oracle := new_oracle
  } with(s)

function update_config(const new_config: lottery_config; var s: storage): storage is
  block {
    if Tezos.sender =/= s.admin then
      failwith("SF_DENIED")
    else if new_config.jackpot_share > 100n then
      failwith("SF_INVALID")
    else
      s.config := new_config
  } with(s)

function calculate_bankroll_share(const response: random_response; var s: storage): nat is
  block {
    var bankroll_share := 0n;
    for range -> multiplier in map s.config.bankroll_distribution block {
      if (response.random >= range.0 and response.random < range.1) then
        bankroll_share := response.bet * multiplier;
      else
        skip;
    };
  } with (bankroll_share)

function calculate_jackpot_share(const response: random_response; var s: storage): nat is
  block {
    var jackpot_share := 0n;
    for range -> multiplier in map s.config.jackpot_distribution block {
      if (response.random >= range.0 and response.random < range.1) then
        jackpot_share := abs(response.bet * int(multiplier) / 100);
      else
        skip;
    };
  } with(jackpot_share)

function obtain_random(const random: list(random_response); var s: storage): list(operation) * storage is
  block {
    if Tezos.sender =/= s.oracle then
      failwith("SF_DENIED")
    else
      skip;
    var ops: list( operation ) := nil;
    var _indices: map (address, nat) := map [];
    for response in list random block {
      var bankroll_share := calculate_bankroll_share(response, s);
      var jackpot_share := calculate_jackpot_share(response, s);
      const payout : nat = bankroll_share + jackpot_share;
      if (payout > 0n) then block {
        for op in list call_transfer_op(record [token = s.token; from_addr = Tezos.self_address; to_addr = response.player; amount = payout]) block {
            ops := op # ops;
        };
        s.bankroll := abs(s.bankroll - bankroll_share);
        s.jackpot := abs(s.jackpot - jackpot_share);
      } else skip;

      var new_pb : list(nat) := nil;
      var pb_idx : nat := case _indices[response.player] of
      | Some(idx) -> idx
      | None -> 0n
      end;
      var old_pb : list(nat) := case s.pending_bets[response.player] of
      | Some(b) -> b
      | None -> nil
      end;
      for pb in list old_pb block {
        var idx : nat := case _indices[response.player] of
        | Some(idx) -> idx
        | None -> 0n
        end;
        if (response.bet_idx =/= idx) then block {
          new_pb := pb # new_pb;
        } else {
          _indices[response.player] := pb_idx + 1n;
        };
      };
      if (List.size(new_pb) = 0n) then block {
          remove response.player from map s.pending_bets;
          s.pending_bet_players := Set.remove(response.player, s.pending_bet_players);
      } else {
          s.pending_bets[response.player] := new_pb;
      };
      s.games_count := s.games_count + 1n;
    }
  } with(ops, s)

function increase_bankroll(const increase_amount: nat; var s: storage): storage is
  block {
    if Tezos.sender =/= s.admin then
      failwith("SF_DENIED")
    else
      s.bankroll := s.bankroll + increase_amount
  } with(s)

function increase_jackpot(const increase_amount: nat; var s: storage): storage is
  block {
    if Tezos.sender =/= s.admin then
      failwith("SF_DENIED")
    else
      s.jackpot := s.jackpot + increase_amount
  } with(s)

function main (const action : action; const store : storage) : list (operation) * storage is
  case action of
  | Bet(args) -> bet(args, store)
  | ChangeAdminAddress(args) -> ((nil : list (operation)), change_admin(args, store))
  | ChangeOracle(args) -> ((nil : list (operation)), change_oracle(args, store))
  | UpdateConfig(args) -> ((nil : list (operation)), update_config(args, store))
  | ObtainRandom(args) -> obtain_random(args, store)
  | IncreaseBankroll(args) -> ((nil : list (operation)), increase_bankroll(args, store))
  | IncreaseJackpot(args) -> ((nil : list (operation)), increase_jackpot(args, store))
 end
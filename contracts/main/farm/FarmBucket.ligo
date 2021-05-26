//////////////////////////////
// single token farm bucket
//
// Requres to have minter permission on reward_token
//////////////////////////////

type farm_config is record [
  reward_amount_per_sec: nat;  // reward amount in utokens per second
  mint_rate_permil: nat;       // permill of acc reward to mint
  mint_min_amount: nat;        // static minimum mint amount per second
]

type farmer_account is record [
  stake_amount: nat;
  reward_amount: nat;
  last_reward_per_stake: nat;
]

type storage is record [
  admin: address;
  token: address;                             // this bucket token to stake
  reward_token: address;                      // token for rewards
  config: farm_config;                        // rates configuration 
  accounts: big_map(address, farmer_account); // accounts invested
  total_stack: nat;
  reward_per_stake: nat;                      // current reward per staked utoken
  last_update_time: timestamp;
]

#include "../../partial/FA2Api.ligo"

function get_farmer(const acc: address; const s: storage) : farmer_account is 
    case s.accounts[acc] of
    | Some(a) -> a
    | None -> record[
        stake_amount = 0n;
        reward_amount = 0n;
        last_reward_per_stake = 0n;
    ]
    end

function calc_reward_rate(const s: storage): storage is 
  block {
    if s.last_update_time < Tezos.now then block {
      if s.total_stack > 0n then block {
        s.reward_per_stake := s.reward_per_stake + abs(Tezos.now - s.last_update_time) * s.config.reward_amount_per_sec / s.total_stack;
      }
      else
        skip;

      s.last_update_time := Tezos.now;
    }
    else
      skip;
  } with(s)

function mint(const reward_amount: nat; const s: storage): operation is 
  block {
    var mint_amount := (s.config.mint_rate_permil * reward_amount) / 1000n + s.config.mint_min_amount;
    
  } with(call_mint_op(s.reward_token, list[record[token_id = 0n; user = Tezos.self_address; amount = mint_amount]]))

function stake(const token_amount: nat; var s: storage): list(operation) * storage is 
  block {
    s := calc_reward_rate(s);
    var acc := get_farmer(Tezos.sender, s);
    var reward_increase := (acc.stake_amount * abs(s.reward_per_stake - acc.last_reward_per_stake));
    acc.reward_amount := acc.reward_amount + reward_increase;
    acc.stake_amount := acc.stake_amount + token_amount;
    acc.last_reward_per_stake := s.reward_per_stake;
    
    s.accounts[Tezos.sender] := acc;
    s.total_stack := s.total_stack + token_amount;

    var ops := call_transfer_op(record [token = s.token; from_addr = Tezos.sender; to_addr = Tezos.self_address; amount = token_amount]);
  } with(ops, s)

function unstake(const token_amount: nat; var s: storage): list(operation) * storage is 
  block {
    s := calc_reward_rate(s);
    var acc := get_farmer(Tezos.sender, s);
    var reward_increase := (acc.stake_amount * abs(s.reward_per_stake - acc.last_reward_per_stake));
    acc.reward_amount := acc.reward_amount + reward_increase;

    var eff_token_amount : nat := 0n;
    if token_amount = 0n then
      eff_token_amount := acc.stake_amount;
    else
      eff_token_amount := token_amount;
    
    if token_amount > acc.stake_amount then
      failwith("SF_INSUFFICIENT_BALANCE");
    else
      skip;
      
    acc.stake_amount := abs(acc.stake_amount - eff_token_amount);
    s.accounts[Tezos.sender] := acc;
    s.total_stack := abs(s.total_stack - eff_token_amount);

    var ops := call_transfer_op(record [token = s.token; from_addr = Tezos.self_address; to_addr = Tezos.sender; amount = eff_token_amount]);
  } with(ops, s)

// transfer whole account reward amount
function claim(var s: storage): list(operation) * storage is 
  block {
    s := calc_reward_rate(s);
    var acc := get_farmer(Tezos.sender, s);
    var reward_increase := (acc.stake_amount * abs(s.reward_per_stake - acc.last_reward_per_stake));
    acc.reward_amount := acc.reward_amount + reward_increase;
    acc.last_reward_per_stake := s.reward_per_stake;

    var reward_to_pay := acc.reward_amount;

    if reward_to_pay = 0n then
      failwith("SF_NO_REWARDS_YET");
    else
      skip;
    acc.reward_amount := 0n;
    s.accounts[Tezos.sender] := acc;
    var ops := call_transfer_op(record [token = s.reward_token; from_addr = Tezos.self_address; to_addr = Tezos.sender; amount = reward_to_pay]);
    ops := mint(reward_to_pay, s) # ops;
  } with(ops, s)

function change_admin(const acc: address; var s: storage): storage is 
  block {
      if Tezos.sender =/= s.admin then
        failwith("SF_DENIED")
      else
        s.admin := acc;
  } with (s)

function update_config(const config : farm_config; var s: storage) : storage is
  block {
    if Tezos.sender =/= s.admin then
      failwith("SF_DENIED");
    else
      skip;
    s.config := config;
  } with(s)


type action is 
  | Stake of nat
  | Unstake of nat
  | Claim of unit
  | ChangeAdmin of address
  | UpdateConfig of farm_config

function main(const action : action; const s : storage) : list(operation) * storage  is
  case action of
  | Stake(args)        -> stake(args, s)
  | Unstake(args)      -> unstake(args, s)
  | Claim(_args)       -> claim(s)
  | ChangeAdmin(args)  -> ((nil : list(operation)), change_admin(args, s))
  | UpdateConfig(args) -> ((nil : list(operation)), update_config(args, s))
  end

// single token farm bucket

type reward_config is record [
  token: address;         // token which be given as reward
  token_account: address; // token account to fund rewards
  reward_rate_mu: nat;    // reward per share per sec in micro tokens
]

type farmer_account is record [
  stake_amount: nat;
  reward_amount: nat;
  last_reward_time: timestamp;
]

type storage is record [
  admin: address;
  token: address;                             // this bucket token
  reward: reward_config;                      // reward configuration
  mint_rate_permil: nat;
  mint_min_amount: nat;
  accounts: big_map(address, farmer_account); // accounts invested in farm
  total_stack: nat;
  total_reward: nat;
  last_update_time: timestamp;
]

// types to call fa2 contracts
type transfer_params is michelson_pair(address, "from", michelson_pair(address, "to", nat, "value"), "")
type transfer_type is TransferType of transfer_params
// 

function get_token_entrypoint(const token : address) : contract(transfer_type) is
  case (Tezos.get_entrypoint_opt("%transfer", token) : option(contract(transfer_type))) of
    | Some(c) -> c
    | None -> (failwith("FA2_TOKEN_NOT_FOUND") : contract(transfer_type))
  end;

function mint_(const _token : address; const _token_amount: nat): int is 0

function change_admin(const acc: address; var s: storage): storage is 
  block {
      if Tezos.sender =/= s.admin then
        failwith("FA2_DENIED")
      else
        s.admin := acc;
  } with (s)

function get_farmer(const acc: address; const s: storage) : farmer_account is 
    case s.accounts[acc] of
    | Some(a) -> a
    | None -> record[
        stake_amount = 0n;
        reward_amount = 0n;
    ]
    end

function stake(const token_amount: nat; var s: storage): list(operation) * storage is 
  block {
    var acc := get_farmer(Tezos.sender, s);
    acc.reward_amount := acc.reward_amount + (acc.stake_amount * s.reward_config.reward_rate_mu * (Tezos.now - acc.last_reward_time));
    acc.last_reward_time := Tezos.now;
    acc.stake_amount := acc.stake_amount + token_amount;
    
    s.accounts[Tezos.sender] := acc;

    const self = Tezos.self_address;
    var ops : list(operation):= nil;
    ops := Tezos.transaction(
        TransferType(Tezos.sender, (self, token_amount)),
        0tez,
        get_token_entrypoint(s.token)
    ) # ops;

  } with(ops, s)

function unstake(const token_amount: nat; var s: storage): list(operation) * storage is 
  block {
    var acc := get_farmer(Tezos.sender, s);
    acc.reward_amount := acc.reward_amount + (acc.stake_amount * s.reward_config.reward_rate_mu * (Tezos.now - acc.last_reward_time));
    acc.last_reward_time := Tezos.now;
    var eff_token_amount : nat := 0;
    if token_amount = 0n then
      eff_token_amount := acc.stake_amount;
    else
      eff_token_amount := token_amount;
    
    if token_amount > acc.stake_amount then
      failwith("NOT_ENOUGH_TOKENS");
    else
      skip;
      
    acc.stake_amount := acc.stake_amount - eff_token_amount;
    var ops : list(operation):= nil;
    ops := Tezos.transaction(
        TransferType(Tezos.self_address, (Tezos.sender, eff_token_amount)),
        0tez,
        get_token_entrypoint(s.token)
    ) # ops;
  } with(ops, s)

// transfer whole account reward amount
function claim(var s: storage): list(operation) * storage is 
  block {
    var acc := get_farmer(Tezos.sender, s);
    acc.reward_amount := acc.reward_amount + (acc.stake_amount * s.reward_config.reward_rate_mu * (Tezos.now - acc.last_reward_time));
    acc.last_reward_time := Tezos.now;

    if acc.reward_amount = 0n then
      failwith('NOT_ENOUGH_REWARD');
    else
      skip;
    
    var ops : list(operation):= nil;
    ops := Tezos.transaction(
        TransferType(Tezos.self_address, (Tezos.sender, acc.reward_amount)),
        0tez,
        get_token_entrypoint(s.reward.token)
    ) # ops;
  } with(ops, s)


type action is 
  | ChangeAdmin of address
  | Stake of nat
  | Unstake of nat
  | Claim of unit

function main(const action : action; const s : storage) : list(operation) * storage  is
  case action of
  | ChangeAdmin(args)  -> ((nil : list(operation)), change_admin(args, s))
  | Stake(args)        -> stake(args, s)
  | Unstake(args)      -> unstake(args, s)
  | Claim(_args)        -> claim(s)
  end

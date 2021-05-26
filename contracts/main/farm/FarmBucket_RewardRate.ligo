//////////////////////////////
// single token farm bucket
// reward amount is rate of staked amount for account
//////////////////////////////

type farm_config is record [
  reward_rate: nat;            // reward per x share per sec in micro tokens. So reward in utokens = (stake_amount * reward_rate * sec) / reward_stake_divisor
  reward_stake_divisor: nat;
  mint_rate_permil: nat;       // permill of acc reward to mint
  mint_min_amount: nat;        // static minimum mint amount per second
]

type farmer_account is record [
  stake_amount: nat;
  reward_amount: nat;
  last_reward_time: timestamp;
]

type storage is record [
  admin: address;
  token: address;                             // this bucket token to stake
  reward_token: address;                      // token for rewards
  config: farm_config;                        // rates configuration 
  accounts: big_map(address, farmer_account); // accounts invested in farm
  total_stack: nat;
  total_reward_paid: nat;
  last_update_time: timestamp;
]

//+ FA2 ops
type transfer_destination is [@layout:comb] record [
  to_                 : address;
  token_id            : nat;
  amount              : nat;
]

type transfer_param is [@layout:comb] record [
  from_               : address;
  txs                 : list(transfer_destination);
]
type transfer_type is Transfer of list(transfer_param)

function get_token_transfer_entrypoint(const token : address) : contract(transfer_type) is
  case (Tezos.get_entrypoint_opt("%transfer", token) : option(contract(transfer_type))) of
    | Some(c) -> c
    | None -> (failwith("FA2_TOKEN_NOT_FOUND") : contract(transfer_type))
  end;

type t_args is record [
  token: address;         // FA2 contract address
  from_addr: address;     // according to FA2 permission policy must be an operator on token contract
  to_addr: address;       // target token account
  amount: nat;
]

function call_transfer_op(const params: t_args) : list(operation) is 
  block {
    var ops : list(operation):= nil;
    ops := Tezos.transaction(
        Transfer(list [record [
          from_ = params.from_addr;
          txs = list [
              record [
                to_ = params.to_addr;
                token_id = 0n;
                amount = params.amount;
              ]
            ]
          ]]),
        0tez,
        get_token_transfer_entrypoint(params.token)
    ) # ops;
  } with(ops)

type mint_param is [@layout:comb] record [
  token_id        : nat;
  user            : address;
  amount          : nat;
]

type mint_params is list(mint_param)

type mint_type is Mint of mint_params
function get_token_mint_entrypoint(const token : address) : contract(mint_type) is
  case (Tezos.get_entrypoint_opt("%mint", token) : option(contract(mint_type))) of
    | Some(c) -> c
    | None -> (failwith("FA2_TOKEN_NOT_FOUND") : contract(mint_type))
  end;

function call_mint_op(const token : address; const params : mint_params) : operation is
  Tezos.transaction(
      Mint(params),
      0tez,
      get_token_mint_entrypoint(token)
  )
    
//- FA2 ops

function change_admin(const acc: address; var s: storage): storage is 
  block {
      if Tezos.sender =/= s.admin then
        failwith("SF_DENIED")
      else
        s.admin := acc;
  } with (s)

function get_farmer(const acc: address; const s: storage) : farmer_account is 
    case s.accounts[acc] of
    | Some(a) -> a
    | None -> record[
        stake_amount = 0n;
        reward_amount = 0n;
        last_reward_time = Tezos.now;
    ]
    end

function calc_reward_addition(const acc: farmer_account; const s: storage): nat is 
  (acc.stake_amount * s.config.reward_rate * abs(Tezos.now - acc.last_reward_time)) / s.config.reward_stake_divisor;

function mint(const reward_amount: nat; const s: storage): operation is 
  block {
    var mint_amount := (s.config.mint_rate_permil * reward_amount) / 1000n + s.config.mint_min_amount;
    
  } with(call_mint_op(s.reward_token, list[record[token_id = 0n; user = Tezos.self_address; amount = mint_amount]]))

function stake(const token_amount: nat; var s: storage): list(operation) * storage is 
  block {
    var acc := get_farmer(Tezos.sender, s);
    var reward_increase := calc_reward_addition(acc, s);
    acc.reward_amount := acc.reward_amount + reward_increase;
    acc.last_reward_time := Tezos.now;
    acc.stake_amount := acc.stake_amount + token_amount;
    
    s.accounts[Tezos.sender] := acc;
    // contract summaries info
    s.total_stack := s.total_stack + token_amount;
    s.last_update_time := Tezos.now;

    var ops := call_transfer_op(record [token = s.token; from_addr = Tezos.sender; to_addr = Tezos.self_address; amount = token_amount]);
  } with(ops, s)

function unstake(const token_amount: nat; var s: storage): list(operation) * storage is 
  block {
    var acc := get_farmer(Tezos.sender, s);
    var reward_increase := calc_reward_addition(acc, s);
    acc.reward_amount := acc.reward_amount + reward_increase;
    acc.last_reward_time := Tezos.now;
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

    // contract summaries info
    s.total_stack := abs(s.total_stack - eff_token_amount);
    s.last_update_time := Tezos.now;

    var ops := call_transfer_op(record [token = s.token; from_addr = Tezos.self_address; to_addr = Tezos.sender; amount = eff_token_amount]);
  } with(ops, s)

// transfer whole account reward amount
function claim(var s: storage): list(operation) * storage is 
  block {
    var acc := get_farmer(Tezos.sender, s);
    var reward_to_pay := calc_reward_addition(acc, s);
    acc.last_reward_time := Tezos.now;

    if reward_to_pay = 0n then
      failwith("SF_EMPTY_REWARDS");
    else
      skip;
    acc.reward_amount := 0n;
    s.accounts[Tezos.sender] := acc;

    // contract summaries info
    s.total_reward_paid := s.total_reward_paid + reward_to_pay;
    s.last_update_time := Tezos.now;
    var ops := call_transfer_op(record [token = s.reward_token; from_addr = Tezos.self_address; to_addr = Tezos.sender; amount = reward_to_pay]);
    ops := mint(reward_to_pay, s) # ops;
  } with(ops, s)

function update_config(const config : farm_config; var s: storage) : storage is
  block {
    if Tezos.sender =/= s.admin then
      failwith("SF_DENIED");
    else
      skip;
    s.config := config;
  } with(s)


type action is 
  | ChangeAdmin of address
  | Stake of nat
  | Unstake of nat
  | Claim of unit
  | UpdateConfig of farm_config

function main(const action : action; const s : storage) : list(operation) * storage  is
  case action of
  | ChangeAdmin(args)  -> ((nil : list(operation)), change_admin(args, s))
  | UpdateConfig(args) -> ((nil : list(operation)), update_config(args, s))
  | Stake(args)        -> stake(args, s)
  | Unstake(args)      -> unstake(args, s)
  | Claim(_args)       -> claim(s)
  end

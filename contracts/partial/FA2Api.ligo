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
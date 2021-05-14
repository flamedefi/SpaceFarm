type token_id is nat

type transfer_destination is [@layout:comb] record [
  to_                 : address;
  token_id            : nat;
  amount              : nat;
]

type transfer_param is [@layout:comb] record [
  from_               : address;
  txs                 : list(transfer_destination);
]

type balance_of_request is [@layout:comb] record [
  owner           : address;
  token_id        : token_id;
]

type balance_of_response is [@layout:comb] record [
  request         : balance_of_request;
  balance         : nat;
]

type balance_params is [@layout:comb] record [
  requests        : list(balance_of_request);
  callback        : contract(list(balance_of_response));
]

type storage is record [
  flame_token         : address;
  admin               : address;
  recipients          : list(address);
]

type transfer_type is Transfer of list(transfer_param)
type balance_of_type is BalanceOf of balance_params

type make_airdrop_params is list(address)
type make_airdrop_callback_params is list(balance_of_response)
type change_admin_params is address

type airdrop_action is
| MakeAirdrop         of make_airdrop_params
| MakeAirdropCallback of make_airdrop_callback_params
| ChangeAdmin         of change_admin_params

type return is list(operation) * storage

[@inline] const no_operations : list(operation) = nil;

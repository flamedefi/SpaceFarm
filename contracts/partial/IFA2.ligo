type token_id is nat

type account is record [
  balance         : nat;
  allowances      : set(address);
]

type token_metadata_info is record [
  token_id        : token_id;
  token_info      : map(string, bytes);
]

type storage is record [
  total_supply    : nat;
  paused          : bool;
  admin           : address;
  minters         : set(address);
  metadata        : big_map(string, bytes);
  ledger          : big_map(address, account);
  token_metadata  : big_map(token_id, token_metadata_info);
]

type transfer_destination is [@layout:comb] record [
  to_             : address;
  token_id        : token_id;
  amount          : nat;
]

type transfer_param is [@layout:comb] record [
  from_           : address;
  txs             : list(transfer_destination);
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

type operator_param is [@layout:comb] record [
  owner           : address;
  operator        : address;
  token_id        : token_id;
]

type update_operator_param is
| Add_operator    of operator_param
| Remove_operator of operator_param

type mint_param is [@layout:comb] record [
  token_id        : token_id;
  user            : address;
  amount          : nat;
]

type burn_param is [@layout:comb] record [
  token_id        : token_id;
  amount          : nat;
]

type minter_param is [@layout:comb] record [
  minter          : address;
  token_id        : token_id;
]

type update_minter_param is
| Add_minter    of minter_param
| Remove_minter of minter_param

type transfer_params is list(transfer_param)
type update_operator_params is list(update_operator_param)
type mint_params is list(mint_param)
type change_admin_params is address
type update_minters_params is list(update_minter_param)
type pause_params is unit
type unpause_params is unit

type token_action is
| Transfer                of transfer_params
| Balance_of              of balance_params
| Update_operators        of update_operator_params
| Mint                    of mint_params
| Burn                    of burn_param
| Change_admin            of change_admin_params
| Update_minters          of update_minters_params
| Pause                   of pause_params
| Unpause                 of unpause_params

type return is list(operation) * storage

[@inline] const default_token_id : token_id = 0n;

[@inline] const no_operations : list(operation) = nil;

type storage is [@layout:comb] record [
  flame_token         : address;
  flame_price         : tez;
  sold_amount         : nat;
  presale_end         : timestamp;
  referral_commission : nat;
  last_buyer          : address;
  admin               : address;
  paused              : bool;
]

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

type burn_param is [@layout:comb] record [
  token_id        : token_id;
  amount          : nat;
]

type transfer_type is Transfer of list(transfer_param)
type balance_of_type is BalanceOf of balance_params
type burn_type is Burn of burn_param

type buy_params is address
type withdraw_xtz_params is address
type burn_unsold_flames_params is unit
type burn_unsold_flames_callback_params is list(balance_of_response)
type change_flame_price_params is tez
type change_referral_commission_params is nat
type change_admin_params is address
type pause_params is bool

type presale_action is
| Buy                       of buy_params
| WithdrawXTZ               of withdraw_xtz_params
| BurnUnsoldFlames          of burn_unsold_flames_params
| BurnUnsoldFlamesCallback  of burn_unsold_flames_callback_params
| ChangeFlamePrice          of change_flame_price_params
| ChangeReferralCommission  of change_referral_commission_params
| ChangeAdmin               of change_admin_params
| Pause                     of pause_params

type return is list(operation) * storage

[@inline] const no_operations : list(operation) = nil;

[@inline] const zero_address : address = ("tz1ZZZZZZZZZZZZZZZZZZZZZZZZZZZZNkiRg" : address);

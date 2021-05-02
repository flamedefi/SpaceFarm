#include "../partial/IFA2.ligo"
#include "../partial/FA2Methods.ligo"

function main(const action : token_action; const s : storage) : return is
  case action of
  | Transfer(params)         -> (no_operations, List.fold(iterate_transfer, params, s))
  | Balance_of(params)       -> (get_balance_of(params, s), s)
  | Update_operators(params) -> (no_operations, List.fold(iterate_update_operator, params, s))
  | Mint(params)             -> (no_operations, mint(params, s))
  | Burn(params)             -> (no_operations, burn(params, s))
  | Change_admin(params)     -> (no_operations, change_admin(params, s))
  | Update_minters(params)   -> (no_operations, List.fold(iterate_update_minters, params, s))
  | Pause                    -> (no_operations, pause(s))
  | Unpause                  -> (no_operations, unpause(s))
  end

#include "../partial/IAirdrop.ligo"
#include "../partial/AirdropMethods.ligo"

function main(const action : airdrop_action; const s : storage) : return is
  case action of
  | MakeAirdrop(params)               -> make_airdrop(params, s)
  | MakeAirdropCallback(params)       -> make_airdrop_callback(params, s)
  | ChangeAdmin(params)               -> change_admin(params, s)
  end

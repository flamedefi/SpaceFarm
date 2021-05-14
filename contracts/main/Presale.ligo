#include "../partial/IPresale.ligo"
#include "../partial/PresaleMethods.ligo"

function main(const action : presale_action; const s : storage) : return is
  case action of
  | Buy(params)                       -> buy(params, s)
  | WithdrawXTZ(params)               -> withdraw_xtz(params, s)
  | BurnUnsoldFlames                  -> burn_unsold_flames(s)
  | BurnUnsoldFlamesCallback(params)  -> burn_unsold_flames_callback(params, s)
  | ChangeFlamePrice(params)          -> change_flame_price(params, s)
  | ChangeReferralCommission(params)  -> change_referral_commission(params, s)
  | ChangeAdmin(params)               -> change_admin(params, s)
  | Pause(params)                     -> pause(params, s)
  end

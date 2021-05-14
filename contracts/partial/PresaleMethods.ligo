function get_flame_token_transfer_entrypoint(const flame_token : address) : contract(transfer_type) is
  case (Tezos.get_entrypoint_opt("%transfer", flame_token) : option(contract(transfer_type))) of
  | Some(c) -> c
  | None -> (failwith("Presale: ill-flame-token-transfer-entrypoint") : contract(transfer_type))
  end

function get_flame_token_burn_entrypoint(const flame_token : address) : contract(burn_type) is
  case (Tezos.get_entrypoint_opt("%burn", flame_token) : option(contract(burn_type))) of
  | Some(c) -> c
  | None -> (failwith("Presale: ill-flame-token-burn-entrypoint") : contract(burn_type))
  end

function get_flame_token_balance_of_entrypoint(const flame_token : address) : contract(balance_of_type) is
  case (Tezos.get_entrypoint_opt("%balance_of", flame_token) : option(contract(balance_of_type))) of
  | Some(c) -> c
  | None -> (failwith("Presale: ill-flame-token-balance_of-entrypoint") : contract(balance_of_type))
  end

function get_burn_unsold_flames_callback_entrypoint(const presale_contract : address) : contract(list(balance_of_response)) is
  case (Tezos.get_entrypoint_opt("%burnUnsoldFlamesCallback", presale_contract) : option(contract(list(balance_of_response)))) of
  | Some(c) -> c
  | None -> (failwith("Presale: ill-burn-unsold-flames-callback-entrypoint") : contract(list(balance_of_response)))
  end

function buy(const referrer : address; var s : storage) : return is
  block {
    if s.paused then
      failwith("Presale: paused")
    else
      skip;

    if Tezos.now > s.presale_end then
      failwith("Presale: already-finished")
    else
      skip;

    var transfer_destinations : list(transfer_destination) := nil;
    const tokens_to_buy : nat = Tezos.amount * 10000n / s.flame_price;

    if referrer =/= Tezos.sender and referrer =/= zero_address then block {
      const actual_paid : nat = tokens_to_buy * abs(100n - s.referral_commission) / 100n;
      const referral_commission : nat = abs(tokens_to_buy - actual_paid);

      transfer_destinations := list [
        record [
          to_ = referrer;
          token_id = 0n;
          amount = referral_commission;
        ];
        record [
          to_ = Tezos.sender;
          token_id = 0n;
          amount = tokens_to_buy;
        ]
      ];
      s.sold_amount := s.sold_amount + referral_commission;
    } else block {
      transfer_destinations := list [
        record [
          to_ = Tezos.sender;
          token_id = 0n;
          amount = tokens_to_buy;
        ]
      ];
    };

    s.last_buyer := Tezos.sender;
    s.sold_amount := s.sold_amount + tokens_to_buy;

    const transfer_param : transfer_param = record [
      from_ = Tezos.self_address;
      txs = transfer_destinations;
    ];
  } with (list [
    Tezos.transaction(
      Transfer(list [transfer_param]),
      0mutez,
      get_flame_token_transfer_entrypoint(s.flame_token)
    )
  ], s)

function withdraw_xtz(const recipient : address; var s : storage) : return is
  block {
    if Tezos.sender =/= s.admin then
      failwith("Presale: not-admin")
    else
      skip;

    const recipient_contract : contract(unit) = case (Tezos.get_contract_opt(recipient) : option(contract(unit))) of
    | Some (c) -> c
    | None -> (failwith ("Presale: contract-not-found") : contract(unit))
    end;
  } with (list [
    Tezos.transaction(
      unit,
      Tezos.balance,
      recipient_contract
    )
  ], s)

function burn_unsold_flames(var s : storage) : return is
  block {
    if Tezos.sender =/= s.admin then
      failwith("Presale: not-admin")
    else
      skip;

    if Tezos.now < s.presale_end then
      failwith("Presale: not-finished-yet")
    else
      skip;

    const balance_params : balance_params = record [
      requests = list [
        record [
          owner = Tezos.self_address;
          token_id = 0n;
        ]
      ];
      callback = get_burn_unsold_flames_callback_entrypoint(Tezos.self_address)
    ];
  } with (list [
    Tezos.transaction(
      BalanceOf(balance_params),
      0mutez,
      get_flame_token_balance_of_entrypoint(s.flame_token)
    )
  ], s)

function burn_unsold_flames_callback(const balance_of_responses : list(balance_of_response); var s : storage) : return is
  block {
    if Tezos.sender =/= s.flame_token then
      failwith("Presale: not-flame-token-contract")
    else
      skip;

    const head : balance_of_response = case List.head_opt(balance_of_responses) of
    | Some(v) -> v
    | None -> (failwith("Presale: empty-balance_of-response-list") : balance_of_response)
    end;
  } with (list [
    Tezos.transaction(
      Burn(record [
        token_id = 0n;
        amount = head.balance;
      ]),
      0mutez,
      get_flame_token_burn_entrypoint(s.flame_token)
    )
  ], s)

function change_flame_price(const new_flame_price : tez; var s : storage) : return is
  block {
    if Tezos.sender =/= s.admin then
      failwith("Presale: not-admin")
    else
      s.flame_price := new_flame_price;
  } with (no_operations, s)

function change_referral_commission(const new_referral_commission : nat; var s : storage) : return is
  block {
    if Tezos.sender =/= s.admin then
      failwith("Presale: not-admin")
    else
      skip;

    if new_referral_commission > 100n then
      failwith("Presale: too-high-new-referral-commission")
    else
      s.referral_commission := new_referral_commission;
  } with (no_operations, s)

function change_admin(const new_admin : address; var s : storage) : return is
  block {
    if Tezos.sender =/= s.admin then
      failwith("Presale: not-admin")
    else
      s.admin := new_admin;
  } with (no_operations, s)

function pause(const flag : bool; var s : storage) : return is
  block {
    if Tezos.sender =/= s.admin then
      failwith("Presale: not-admin")
    else
      skip;

    if flag then block {
      if s.paused then
        failwith("Presale: already-paused")
      else
        s.paused := flag;
    } else block {
      if not s.paused then
        failwith("Presale: already-unpaused")
      else
        s.paused := flag;
    };
  } with (no_operations, s)

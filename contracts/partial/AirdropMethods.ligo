function get_flame_token_transfer_entrypoint(const flame_token : address) : contract(transfer_type) is
  case (Tezos.get_entrypoint_opt("%transfer", flame_token) : option(contract(transfer_type))) of
  | Some(c) -> c
  | None -> (failwith("Airdrop: ill-flame-token-transfer-entrypoint") : contract(transfer_type))
  end

function get_flame_token_balance_of_entrypoint(const flame_token : address) : contract(balance_of_type) is
  case (Tezos.get_entrypoint_opt("%balance_of", flame_token) : option(contract(balance_of_type))) of
  | Some(c) -> c
  | None -> (failwith("Airdrop: ill-flame-token-balance_of-entrypoint") : contract(balance_of_type))
  end

function get_make_airdrop_callback_entrypoint(const airdrop_contract : address) : contract(list(balance_of_response)) is
  case (Tezos.get_entrypoint_opt("%makeAirdropCallback", airdrop_contract) : option(contract(list(balance_of_response)))) of
  | Some(c) -> c
  | None -> (failwith("Airdrop: ill-make-airdrop-callback-entrypoint") : contract(list(balance_of_response)))
  end

function make_airdrop(const recipients : list(address); var s : storage) : return is
  block {
    if Tezos.sender =/= s.admin then
      failwith("Airdrop: not-admin")
    else
      skip;

    s.recipients := recipients;

    const balance_params : balance_params = record [
      requests = list [
        record [
          owner = Tezos.self_address;
          token_id = 0n;
        ]
      ];
      callback = get_make_airdrop_callback_entrypoint(Tezos.self_address)
    ];
  } with (list [
    Tezos.transaction(
      BalanceOf(balance_params),
      0mutez,
      get_flame_token_balance_of_entrypoint(s.flame_token)
    )
  ], s)

function make_airdrop_callback(const balance_of_responses : list(balance_of_response); var s : storage) : return is
  block {
    if Tezos.sender =/= s.flame_token then
      failwith("Airdrop: not-flame-token-contract")
    else
      skip;

    const head : balance_of_response = case List.head_opt(balance_of_responses) of
    | Some(v) -> v
    | None -> (failwith("Airdrop: empty-balance_of-response-list") : balance_of_response)
    end;
    const amount_to_transfer : nat = head.balance / List.length(s.recipients);

    function iterate(const user : address) : transfer_destination is
      block {
        const destination : transfer_destination = record [
          to_ = user;
          token_id = 0n;
          amount = amount_to_transfer;
        ];
      } with destination;

    const transfer_destinations : list(transfer_destination) = List.map(iterate, s.recipients);
    const transfer_param : transfer_param = record [
      from_ = Tezos.self_address;
      txs = transfer_destinations;
    ];

    s.recipients := (list [] : list(address));
  } with (list [
    Tezos.transaction(
      Transfer(list [transfer_param]),
      0mutez,
      get_flame_token_transfer_entrypoint(s.flame_token)
    )
  ], s)

function change_admin(const new_admin : address; var s : storage) : return is
  block {
    if Tezos.sender =/= s.admin then
      failwith("Airdrop: not-admin")
    else
      s.admin := new_admin;
  } with (no_operations, s)

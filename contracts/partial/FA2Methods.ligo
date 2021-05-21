
function get_account(const user : address; const s : storage) : account is
  case s.ledger[user] of
    | None -> record [
      balance = 0n;
      allowances = (set [] : set(address));
    ]
    | Some(acc) -> acc
  end

function make_transfer(const user_trx_params : transfer_param; var s : storage; const transfer : transfer_destination) : storage is
    block {
    var sender_account := get_account(user_trx_params.from_, s);

    if default_token_id =/= transfer.token_id then
        failwith("FA2_TOKEN_UNDEFINED")
    else
        skip;

    if sender_account.balance < transfer.amount then
        failwith("FA2_INSUFFICIENT_BALANCE")
    else
        skip;

    sender_account.balance := abs(sender_account.balance - transfer.amount);
    s.ledger[user_trx_params.from_] := sender_account;

    var dest_account : account := get_account(transfer.to_, s);

    dest_account.balance := dest_account.balance + transfer.amount;
    s.ledger[transfer.to_] := dest_account;
    } with s

function iterate_transfer(const s : storage; const user_trx_params : transfer_param) : storage is
  block {
    if s.paused then
      failwith("FA2_PAUSED")
    else
      skip;

    var sender_account : account := get_account(user_trx_params.from_, s);

    if user_trx_params.from_ = Tezos.sender or sender_account.allowances contains Tezos.sender then
      skip
    else
      failwith("FA2_NOT_OPERATOR");
  } with List.fold(function (var s : storage; const transfer : transfer_destination) is make_transfer(user_trx_params, s, transfer), user_trx_params.txs, s)

function iterate_update_operator(var s : storage; const params : update_operator_param) : storage is
  block {
    if s.paused then
      failwith("FA2_PAUSED")
    else
      skip;

    case params of
    | Add_operator(param) -> {
      if default_token_id =/= param.token_id then
        failwith("FA2_TOKEN_UNDEFINED")
      else
        skip;

      if Tezos.sender =/= param.owner then
        failwith("FA2_NOT_OWNER")
      else
        skip;

      var sender_account : account := get_account(param.owner, s);

      sender_account.allowances := Set.add(param.operator, sender_account.allowances);
      s.ledger[param.owner] := sender_account;
    }
    | Remove_operator(param) -> {
      if default_token_id =/= param.token_id then
        failwith("FA2_TOKEN_UNDEFINED")
      else
        skip;

      if Tezos.sender =/= param.owner then
        failwith("FA2_NOT_OWNER")
      else
        skip;

      var sender_account : account := get_account(param.owner, s);

      sender_account.allowances := Set.remove(param.operator, sender_account.allowances);
      s.ledger[param.owner] := sender_account;
    }
    end
  } with s

function get_balance_of(const balance_params : balance_params; const s : storage) : list(operation) is
  block {
    function look_up_balance(var l: list (balance_of_response); const request : balance_of_request) : list(balance_of_response) is
      block {
        if default_token_id =/= request.token_id then
          failwith("FA2_TOKEN_UNDEFINED")
        else
          skip;

        const sender_account : account = get_account(request.owner, s);
        const response : balance_of_response = record [
          request = request;
          balance = sender_account.balance;
        ];
      } with response # l;

    const accumulated_response : list(balance_of_response) = List.fold(
      look_up_balance,
      balance_params.requests,
      (nil : list(balance_of_response))
    );
  } with list [transaction(accumulated_response, 0tz, balance_params.callback)]

function mint(const params : mint_params; const s : storage) : storage is
  block {
    if s.paused then
      failwith("FA2_PAUSED")
    else
      skip;

    if s.minters contains Tezos.sender then
      skip
    else
      failwith("FA2_NOT_MINTER");

    function mint_tokens(var s : storage; const param : mint_param) : storage is
      block {
        if default_token_id =/= param.token_id then
          failwith("FA2_TOKEN_UNDEFINED")
        else
          skip;

        var user : account := get_account(param.user, s);

        user.balance := user.balance + param.amount;
        s.total_supply := s.total_supply + param.amount;
        s.ledger[param.user] := user;
      } with s
  } with List.fold(mint_tokens, params, s)

function burn(const param : burn_param; const s : storage) : storage is
  block {
    if s.paused then
      failwith("FA2_PAUSED")
    else
      skip;

    if default_token_id =/= param.token_id then
      failwith("FA2_TOKEN_UNDEFINED")
    else
      skip;

    var user : account := get_account(Tezos.sender, s);

    if user.balance < param.amount then
      failwith("FA2_INSUFFICIENT_BALANCE")
    else
      skip;

    user.balance := abs(user.balance - param.amount);
    s.total_supply := abs(s.total_supply - param.amount);
    s.ledger[Tezos.sender] := user;
  } with s

function change_admin(const new_admin : address; var s : storage) : storage is
  block {
    if Tezos.sender =/= s.admin then
      failwith("FA2_NOT_ADMIN")
    else
      s.admin := new_admin;
  } with s

function iterate_update_minters(var s : storage; const params : update_minter_param) : storage is
  block {
    if Tezos.sender =/= s.admin then
      failwith("FA2_NOT_ADMIN")
    else
      skip;

    case params of
    | Add_minter(param) -> {
      if default_token_id =/= param.token_id then
        failwith("FA2_TOKEN_UNDEFINED")
      else
        skip;

      s.minters := Set.add(param.minter, s.minters);
    }
    | Remove_minter(param) -> {
      if default_token_id =/= param.token_id then
        failwith("FA2_TOKEN_UNDEFINED")
      else
        skip;

      s.minters := Set.remove(param.minter, s.minters);
    }
    end
  } with s

function pause(var s : storage) : storage is
  block {
    if Tezos.sender =/= s.admin then
      failwith("FA2_NOT_ADMIN")
    else if s.paused then
      failwith("FA2_ALREADY_PAUSED")
    else
      s.paused := True;
  } with s

function unpause(var s : storage) : storage is
  block {
    if Tezos.sender =/= s.admin then
      failwith("FA2_NOT_ADMIN")
    else if not s.paused then
      failwith("FA2_ALREADY_UNPAUSED")
    else
      s.paused := False;
  } with s
  
-- Erasure is an internal privacy operation until a separately authenticated
-- end-user deletion workflow exists. Do not expose its definer privileges.
revoke execute on function public.erase_app_user(uuid, uuid) from authenticated;

-- Run in the Supabase SQL Editor after creating and confirming YOUR PLYDECK login.
-- Copy that account's UUID from Authentication > Users.
-- Replace the placeholder below with that UUID. This script does not create a password.
-- Re-running for the same UUID is safe. Do not grant the role to a customer.
do $$
declare
  admin_user_id_text text := 'PASTE_YOUR_AUTH_USER_UUID_HERE';
  admin_user_id uuid;
begin
  if admin_user_id_text='PASTE_YOUR_AUTH_USER_UUID_HERE' then
    raise exception 'Replace PASTE_YOUR_AUTH_USER_UUID_HERE with your own Auth user UUID first.';
  end if;
  admin_user_id=admin_user_id_text::uuid;
  if not exists(select 1 from auth.users where id=admin_user_id) then
    raise exception 'No Auth user exists for that UUID. Register and confirm the account first.';
  end if;
  insert into public.admins(user_id) values(admin_user_id) on conflict(user_id) do nothing;
end;$$;

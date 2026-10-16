-- Custom Order requests are submitted through the protected Edge Function only.
-- Browser roles remain unable to insert directly into the Admin order history.
revoke insert on table public.order_requests from anon, authenticated;
grant insert on table public.order_requests to service_role;

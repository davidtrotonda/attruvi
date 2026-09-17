-- Membership changes must pass through the audited RPCs above. Keeping direct
-- table writes would let a caller bypass the final-owner invariant even though
-- the row itself still satisfies RLS.
revoke insert, update, delete on table public.organization_members from authenticated;

comment on table public.organization_members is
  'Organization roles. Authenticated clients read under RLS; all membership writes use audited RPCs that protect the final owner.';

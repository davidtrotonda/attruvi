create or replace function private.validate_ad_cost_mapping_provider()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  account_provider public.source_kind;
  mapped_source_kind public.source_kind;
begin
  select account.provider into account_provider
  from public.connector_accounts account
  where account.id = new.connector_account_id;

  select source.kind into mapped_source_kind
  from public.sources source
  where source.id = new.source_id;

  if account_provider is null or mapped_source_kind is null then
    raise exception using errcode = '23503', message = 'mapping account or source is unavailable';
  end if;
  if account_provider <> 'manual' and account_provider <> mapped_source_kind then
    raise exception using errcode = '23514', message = 'remote cost mapping must keep the provider source';
  end if;
  return new;
end;
$$;

create trigger ad_cost_mappings_provider_matches
before insert or update of connector_account_id, source_id
on public.ad_cost_mappings
for each row execute function private.validate_ad_cost_mapping_provider();

create or replace function private.apply_ad_cost_mapping()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  mapped public.ad_cost_mappings%rowtype;
  mapping_found boolean := false;
begin
  if new.connector_account_id is null then
    return new;
  end if;

  if new.campaign_external_id is not null then
    select * into mapped
    from public.ad_cost_mappings candidate
    where candidate.connector_account_id = new.connector_account_id
      and candidate.entity_kind = 'campaign'
      and candidate.external_id = new.campaign_external_id;
    if found then
      new.source_id := mapped.source_id;
      new.campaign_id := mapped.campaign_id;
      new.ad_group_id := null;
      new.ad_id := null;
      mapping_found := true;
    end if;
  end if;

  if new.ad_group_external_id is not null then
    select * into mapped
    from public.ad_cost_mappings candidate
    where candidate.connector_account_id = new.connector_account_id
      and candidate.entity_kind = 'ad_group'
      and candidate.external_id = new.ad_group_external_id;
    if found then
      new.source_id := mapped.source_id;
      new.campaign_id := mapped.campaign_id;
      new.ad_group_id := mapped.ad_group_id;
      new.ad_id := null;
      mapping_found := true;
    end if;
  end if;

  if new.ad_external_id is not null then
    select * into mapped
    from public.ad_cost_mappings candidate
    where candidate.connector_account_id = new.connector_account_id
      and candidate.entity_kind = 'ad'
      and candidate.external_id = new.ad_external_id;
    if found then
      new.source_id := mapped.source_id;
      new.campaign_id := mapped.campaign_id;
      new.ad_group_id := mapped.ad_group_id;
      new.ad_id := mapped.ad_id;
      mapping_found := true;
    end if;
  end if;

  if mapping_found then
    new.match_status := case
      when new.campaign_external_id is not null and new.campaign_id is null then 'unmatched'
      when new.ad_group_external_id is not null and new.ad_group_id is null then 'partially_matched'
      when new.ad_external_id is not null and new.ad_id is null then 'partially_matched'
      else 'matched'
    end;
    new.unmatched_reason := case
      when new.match_status = 'matched' then null
      else 'La asignación manual no cubre todavía toda la jerarquía'
    end;
  end if;
  return new;
end;
$$;

-- Alphabetical trigger order makes this run before the existing hierarchy
-- validator, so that validator checks the mapped hierarchy rather than stale
-- auto-discovered IDs.
create trigger ad_costs_apply_manual_mapping
before insert or update of
  connector_account_id, campaign_external_id, ad_group_external_id,
  ad_external_id, source_id, campaign_id, ad_group_id, ad_id
on public.ad_costs
for each row execute function private.apply_ad_cost_mapping();

revoke all on function private.validate_ad_cost_mapping_provider() from public, anon, authenticated;
revoke all on function private.apply_ad_cost_mapping() from public, anon, authenticated;

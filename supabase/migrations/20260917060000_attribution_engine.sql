create type public.attribution_scope as enum ('acquisition', 'reengagement');
create type public.attribution_rule_status as enum ('draft', 'active', 'archived');

create table public.attribution_rule_sets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  app_id uuid not null,
  version text not null,
  status public.attribution_rule_status not null default 'draft',
  model text not null default 'last_non_organic_click',
  acquisition_window_days smallint not null default 7,
  reengagement_window_hours smallint not null default 24,
  probabilistic_enabled boolean not null default false,
  probabilistic_window_minutes smallint not null default 15,
  probabilistic_confidence numeric(5,4) not null default 0.5500,
  probabilistic_legal_basis text,
  created_by uuid references auth.users (id) on delete set null,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attribution_rule_sets_app_fk foreign key (app_id, organization_id)
    references public.apps (id, organization_id) on delete cascade,
  constraint attribution_rule_sets_tenant_identity unique (id, organization_id, app_id),
  constraint attribution_rule_sets_version unique (app_id, version),
  constraint attribution_rule_sets_model check (model = 'last_non_organic_click'),
  constraint attribution_rule_sets_version_format check (version ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$'),
  constraint attribution_rule_sets_acquisition_window check (acquisition_window_days between 1 and 90),
  constraint attribution_rule_sets_reengagement_window check (reengagement_window_hours between 1 and 720),
  constraint attribution_rule_sets_probabilistic_window check (probabilistic_window_minutes between 1 and 60),
  constraint attribution_rule_sets_probabilistic_confidence check (probabilistic_confidence between 0.1000 and 0.8000),
  constraint attribution_rule_sets_probabilistic_legal_basis check (
    not probabilistic_enabled
    or nullif(btrim(probabilistic_legal_basis), '') is not null
  ),
  constraint attribution_rule_sets_activation check (
    (status = 'active' and activated_at is not null)
    or status <> 'active'
  )
);

create unique index attribution_rule_sets_one_active_idx
  on public.attribution_rule_sets (app_id)
  where status = 'active';
create index attribution_rule_sets_org_app_idx
  on public.attribution_rule_sets (organization_id, app_id, status, created_at desc);

insert into public.attribution_rule_sets (
  organization_id, app_id, version, status, activated_at
)
select app.organization_id, app.id, 'v1', 'active', statement_timestamp()
from public.apps app
on conflict (app_id, version) do nothing;

alter table public.attribution_candidates
  add column scope public.attribution_scope,
  add column engagement_id uuid,
  add column match_type public.attribution_method,
  add column attribution_window_seconds integer,
  add column decision_reason text,
  add column is_winner boolean not null default false,
  add column source_external_id text,
  add column source_name text,
  add column campaign_external_id text,
  add column campaign_name text,
  add column ad_group_external_id text,
  add column ad_group_name text,
  add column ad_external_id text,
  add column ad_name text;

update public.attribution_candidates
set scope = 'acquisition',
    engagement_id = installation_id,
    match_type = method,
    attribution_window_seconds = 604800,
    decision_reason = 'Decisión histórica anterior al motor versionado.';

alter table public.attribution_candidates
  alter column scope set not null,
  alter column engagement_id set not null,
  alter column match_type set not null,
  alter column attribution_window_seconds set not null,
  alter column decision_reason set not null,
  drop constraint attribution_candidates_unique_key,
  add constraint attribution_candidates_match_type check (match_type = method),
  add constraint attribution_candidates_window check (attribution_window_seconds between 60 and 7776000),
  add constraint attribution_candidates_unique_key
    unique (app_id, installation_id, scope, engagement_id, candidate_key, rule_version);

drop index public.attribution_candidates_installation_score_idx;
create index attribution_candidates_installation_score_idx
  on public.attribution_candidates (
    installation_id, scope, engagement_id, rule_version, is_winner desc, score desc, observed_at desc
  );

alter table public.attributions
  add column scope public.attribution_scope,
  add column engagement_id uuid,
  add column match_type public.attribution_method,
  add column attribution_window_seconds integer,
  add column decision_reason text,
  add column is_manual boolean not null default false,
  add column source_external_id text,
  add column source_name text,
  add column campaign_external_id text,
  add column campaign_name text,
  add column ad_group_external_id text,
  add column ad_group_name text,
  add column ad_external_id text,
  add column ad_name text;

update public.attributions
set scope = 'acquisition',
    engagement_id = installation_id,
    match_type = method,
    attribution_window_seconds = attribution_window_days::integer * 86400,
    decision_reason = 'Decisión histórica anterior al motor versionado.',
    is_manual = method = 'manual';

alter table public.attributions
  alter column scope set not null,
  alter column engagement_id set not null,
  alter column match_type set not null,
  alter column attribution_window_seconds set not null,
  alter column decision_reason set not null,
  add constraint attributions_match_type check (match_type = method),
  add constraint attributions_window_seconds check (attribution_window_seconds between 60 and 7776000),
  add constraint attributions_scope_engagement check (
    (scope = 'acquisition' and engagement_id = installation_id)
    or scope = 'reengagement'
  );

drop index public.attributions_current_installation_idx;
drop index public.attributions_rule_version_idx;
create unique index attributions_current_engagement_idx
  on public.attributions (app_id, installation_id, scope, engagement_id)
  where is_current;
create unique index attributions_rule_version_idx
  on public.attributions (app_id, installation_id, scope, engagement_id, rule_version);
create index attributions_app_scope_time_idx
  on public.attributions (app_id, scope, attributed_at desc)
  where is_current;

create or replace function private.create_default_attribution_rule_set()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.attribution_rule_sets (
    organization_id, app_id, version, status, activated_at, created_by
  ) values (
    new.organization_id, new.id, 'v1', 'active', statement_timestamp(), (select auth.uid())
  );
  return new;
end;
$$;

create trigger apps_create_default_attribution_rule_set
after insert on public.apps
for each row execute function private.create_default_attribution_rule_set();

create trigger attribution_rule_sets_set_updated_at
before update on public.attribution_rule_sets
for each row execute function private.set_updated_at();

alter table public.attribution_rule_sets enable row level security;

create policy attribution_rule_sets_member_read on public.attribution_rule_sets
for select to authenticated
using ((select private.is_organization_member(organization_id)));

create policy attribution_rule_sets_admin_insert on public.attribution_rule_sets
for insert to authenticated
with check ((select private.has_organization_role(
  organization_id,
  array['owner', 'admin']::public.organization_role[]
)));

create policy attribution_rule_sets_admin_update on public.attribution_rule_sets
for update to authenticated
using ((select private.has_organization_role(
  organization_id,
  array['owner', 'admin']::public.organization_role[]
)))
with check ((select private.has_organization_role(
  organization_id,
  array['owner', 'admin']::public.organization_role[]
)));

create policy attribution_rule_sets_admin_delete on public.attribution_rule_sets
for delete to authenticated
using ((select private.has_organization_role(
  organization_id,
  array['owner', 'admin']::public.organization_role[]
)));

revoke all on public.attribution_rule_sets from public, anon, authenticated;
grant all on public.attribution_rule_sets to service_role;
grant select, insert, update, delete on public.attribution_rule_sets to authenticated;

comment on table public.attribution_rule_sets is
  'Versioned, app-scoped attribution rules. Probabilistic matching is disabled by default and requires an explicit documented legal basis.';
comment on column public.attribution_candidates.evidence is
  'Minimized evidence only. Raw IP addresses, user-agent strings and persistent device fingerprints are forbidden.';

create or replace function private.evaluate_attribution(
  requested_app_id uuid,
  requested_installation_id uuid,
  requested_scope public.attribution_scope,
  requested_engagement_id uuid,
  requested_observed_at timestamptz,
  provided_evidence jsonb default '{}'::jsonb,
  requested_rule_version text default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  installation_row public.installations%rowtype;
  rule_row public.attribution_rule_sets%rowtype;
  window_seconds integer;
  candidate_list jsonb;
  winning_candidate jsonb;
begin
  if provided_evidence is null or jsonb_typeof(provided_evidence) <> 'object' then
    raise exception 'invalid_attribution_evidence' using errcode = '22023';
  end if;

  select installation.* into installation_row
  from public.installations installation
  where installation.app_id = requested_app_id
    and installation.id = requested_installation_id;
  if not found then
    raise exception 'installation_not_found' using errcode = 'P0002';
  end if;

  if requested_scope = 'acquisition' and requested_engagement_id <> requested_installation_id then
    raise exception 'invalid_acquisition_engagement' using errcode = '22023';
  end if;

  if requested_scope = 'reengagement' and not exists (
    select 1 from public.sessions session
    where session.id = requested_engagement_id
      and session.installation_id = requested_installation_id
      and session.app_id = requested_app_id
  ) then
    raise exception 'reengagement_session_not_found' using errcode = 'P0002';
  end if;

  select rule.* into rule_row
  from public.attribution_rule_sets rule
  where rule.app_id = requested_app_id
    and (
      (requested_rule_version is null and rule.status = 'active')
      or rule.version = requested_rule_version
    )
  order by (rule.status = 'active') desc, rule.created_at desc
  limit 1;
  if not found then
    raise exception 'attribution_rule_not_found' using errcode = 'P0002';
  end if;

  window_seconds := case requested_scope
    when 'acquisition' then rule_row.acquisition_window_days::integer * 86400
    else rule_row.reengagement_window_hours::integer * 3600
  end;

  with signal_values(signal_name, signal_value) as (
    values
      ('gclid', nullif(provided_evidence ->> 'gclid', '')),
      ('gbraid', nullif(provided_evidence ->> 'gbraid', '')),
      ('wbraid', nullif(provided_evidence ->> 'wbraid', '')),
      ('fbclid', nullif(provided_evidence ->> 'fbclid', '')),
      ('ttclid', nullif(provided_evidence ->> 'ttclid', ''))
  ), eligible_clicks as (
    select
      click.id click_id,
      click.clicked_at,
      click.gclid,
      click.gbraid,
      click.wbraid,
      click.fbclid,
      click.ttclid,
      click.user_agent_hash,
      click.network_prefix_hash,
      link.attribution_window_days,
      link.source_id,
      link.campaign_id,
      link.ad_group_id,
      link.ad_id,
      source.external_id source_external_id,
      source.name source_name,
      campaign.external_id campaign_external_id,
      campaign.name campaign_name,
      ad_group.external_id ad_group_external_id,
      ad_group.name ad_group_name,
      ad.external_id ad_external_id,
      ad.name ad_name
    from public.link_clicks click
    join public.smart_links link
      on link.id = click.smart_link_id
     and link.organization_id = click.organization_id
     and link.app_id = click.app_id
    left join public.sources source on source.id = link.source_id
    left join public.campaigns campaign on campaign.id = link.campaign_id
    left join public.ad_groups ad_group on ad_group.id = link.ad_group_id
    left join public.ads ad on ad.id = link.ad_id
    where click.app_id = requested_app_id
      and not click.is_bot
      and not coalesce(click.is_test, false)
      and click.clicked_at <= requested_observed_at + interval '5 minutes'
      and click.clicked_at >= requested_observed_at - make_interval(secs => window_seconds)
      and (
        requested_scope = 'reengagement'
        or click.clicked_at >= requested_observed_at
          - make_interval(days => least(rule_row.acquisition_window_days, link.attribution_window_days))
      )
  ), raw_candidates as (
    select
      'explicit-click:' || click.click_id::text candidate_key,
      case
        when installation_row.platform = 'android'
          and provided_evidence ->> 'method' = 'install_referrer'
          then 'install_referrer'::public.attribution_method
        else 'direct_link'::public.attribution_method
      end match_type,
      case
        when installation_row.platform = 'android'
          and provided_evidence ->> 'method' = 'install_referrer'
          then 400
        else 500
      end evidence_rank,
      case
        when installation_row.platform = 'android'
          and provided_evidence ->> 'method' = 'install_referrer'
          then 0.9800::numeric
        else 1.0000::numeric
      end confidence,
      click.clicked_at,
      click.click_id,
      click.source_id,
      click.campaign_id,
      click.ad_group_id,
      click.ad_id,
      click.source_external_id,
      click.source_name,
      click.campaign_external_id,
      click.campaign_name,
      click.ad_group_external_id,
      click.ad_group_name,
      click.ad_external_id,
      click.ad_name,
      case
        when installation_row.platform = 'android'
          and provided_evidence ->> 'method' = 'install_referrer'
          then 'El click_id llegó dentro del Play Install Referrer y coincide con un clic válido.'
        else 'La app recibió directamente el click_id mediante un Universal Link o App Link.'
      end decision_reason,
      jsonb_build_object(
        'signal', case
          when installation_row.platform = 'android'
            and provided_evidence ->> 'method' = 'install_referrer'
            then 'play_install_referrer_click_id'
          else 'direct_click_id'
        end,
        'clickId', click.click_id,
        'clickedAt', click.clicked_at
      ) evidence
    from eligible_clicks click
    where provided_evidence ->> 'clickId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and click.click_id = (provided_evidence ->> 'clickId')::uuid
      and (
        requested_scope = 'acquisition'
        or case
          when provided_evidence ->> 'capturedAt' ~ '^\d{4}-\d{2}-\d{2}T'
            and pg_catalog.pg_input_is_valid(
              provided_evidence ->> 'capturedAt', 'timestamp with time zone'
            )
            then (provided_evidence ->> 'capturedAt')::timestamptz
              between requested_observed_at - interval '15 minutes'
              and requested_observed_at + interval '5 minutes'
          else false
        end
      )

    union all

    select
      case
        when installation_row.platform = 'android'
          and provided_evidence ->> 'method' = 'install_referrer'
          then 'referrer-network:'
        else 'official-network:'
      end || signal.signal_name || ':' || pg_catalog.encode(
        extensions.digest(signal.signal_value, 'sha256'), 'hex'
      ) || ':' || click.click_id::text,
      case
        when installation_row.platform = 'android'
          and provided_evidence ->> 'method' = 'install_referrer'
          then 'install_referrer'::public.attribution_method
        else 'network_signal'::public.attribution_method
      end,
      case
        when installation_row.platform = 'android'
          and provided_evidence ->> 'method' = 'install_referrer'
          then 390
        else 300
      end,
      case
        when installation_row.platform = 'android'
          and provided_evidence ->> 'method' = 'install_referrer'
          then 0.9500::numeric
        else 0.9000::numeric
      end,
      click.clicked_at,
      click.click_id,
      click.source_id,
      click.campaign_id,
      click.ad_group_id,
      click.ad_id,
      click.source_external_id,
      click.source_name,
      click.campaign_external_id,
      click.campaign_name,
      click.ad_group_external_id,
      click.ad_group_name,
      click.ad_external_id,
      click.ad_name,
      case
        when installation_row.platform = 'android'
          and provided_evidence ->> 'method' = 'install_referrer'
          then 'Un identificador de red llegó dentro del Play Install Referrer y coincide exactamente.'
        else 'Un identificador oficial y consentido de la red coincide exactamente con el clic.'
      end,
      jsonb_build_object(
        'signal', case
          when installation_row.platform = 'android'
            and provided_evidence ->> 'method' = 'install_referrer'
            then 'play_install_referrer_network_id'
          else 'official_network_id'
        end,
        'identifierType', signal.signal_name,
        'clickId', click.click_id,
        'clickedAt', click.clicked_at
      )
    from signal_values signal
    join eligible_clicks click on (
      (signal.signal_name = 'gclid' and click.gclid = signal.signal_value)
      or (signal.signal_name = 'gbraid' and click.gbraid = signal.signal_value)
      or (signal.signal_name = 'wbraid' and click.wbraid = signal.signal_value)
      or (signal.signal_name = 'fbclid' and click.fbclid = signal.signal_value)
      or (signal.signal_name = 'ttclid' and click.ttclid = signal.signal_value)
    )
    where signal.signal_value is not null
      and (
        (
          installation_row.platform = 'android'
          and provided_evidence ->> 'method' = 'install_referrer'
        )
        or installation_row.consent_state = 'granted'
      )
      and (
        requested_scope = 'acquisition'
        or case
          when provided_evidence ->> 'capturedAt' ~ '^\d{4}-\d{2}-\d{2}T'
            and pg_catalog.pg_input_is_valid(
              provided_evidence ->> 'capturedAt', 'timestamp with time zone'
            )
            then (provided_evidence ->> 'capturedAt')::timestamptz
              between requested_observed_at - interval '15 minutes'
              and requested_observed_at + interval '5 minutes'
          else false
        end
      )

    union all

    select
      'probabilistic:' || click.click_id::text,
      'probabilistic'::public.attribution_method,
      200,
      rule_row.probabilistic_confidence,
      click.clicked_at,
      click.click_id,
      click.source_id,
      click.campaign_id,
      click.ad_group_id,
      click.ad_id,
      click.source_external_id,
      click.source_name,
      click.campaign_external_id,
      click.campaign_name,
      click.ad_group_external_id,
      click.ad_group_name,
      click.ad_external_id,
      click.ad_name,
      'Coincidencia temporal limitada de dos señales minimizadas. No es una identificación determinista.',
      jsonb_build_object(
        'signal', 'limited_probabilistic_match',
        'matchedSignals', jsonb_build_array('network_prefix_hash', 'user_agent_hash'),
        'clickId', click.click_id,
        'clickedAt', click.clicked_at,
        'windowMinutes', rule_row.probabilistic_window_minutes
      )
    from eligible_clicks click
    where rule_row.probabilistic_enabled
      and nullif(btrim(rule_row.probabilistic_legal_basis), '') is not null
      and installation_row.consent_state = 'granted'
      and provided_evidence #>> '{probabilisticEvidence,networkPrefixHash}' ~ '^[a-f0-9]{64}$'
      and provided_evidence #>> '{probabilisticEvidence,userAgentHash}' ~ '^[a-f0-9]{64}$'
      and click.network_prefix_hash = pg_catalog.decode(
        provided_evidence #>> '{probabilisticEvidence,networkPrefixHash}', 'hex'
      )
      and click.user_agent_hash = pg_catalog.decode(
        provided_evidence #>> '{probabilisticEvidence,userAgentHash}', 'hex'
      )
      and click.clicked_at >= requested_observed_at
        - make_interval(mins => rule_row.probabilistic_window_minutes)

    union all

    select
      'organic',
      'organic'::public.attribution_method,
      0,
      0.2500::numeric,
      requested_observed_at,
      null::uuid,
      (
        select source.id from public.sources source
        where source.app_id = requested_app_id and source.kind = 'organic'
        order by source.created_at, source.id limit 1
      ),
      null::uuid,
      null::uuid,
      null::uuid,
      (
        select source.external_id from public.sources source
        where source.app_id = requested_app_id and source.kind = 'organic'
        order by source.created_at, source.id limit 1
      ),
      coalesce((
        select source.name from public.sources source
        where source.app_id = requested_app_id and source.kind = 'organic'
        order by source.created_at, source.id limit 1
      ), 'Orgánico'),
      null::text,
      null::text,
      null::text,
      null::text,
      null::text,
      null::text,
      case
        when installation_row.platform = 'ios'
          then 'iOS no entregó una señal permitida suficiente; se usa el fallback orgánico, no una atribución determinista.'
        when installation_row.consent_state <> 'granted'
          then 'No existe evidencia suficiente con el consentimiento disponible; se usa el fallback orgánico.'
        else 'No existe evidencia suficiente dentro de la ventana configurada; se usa el fallback orgánico.'
      end,
      jsonb_build_object(
        'signal', 'no_sufficient_evidence',
        'platform', installation_row.platform,
        'consent', installation_row.consent_state
      )
  ), deduplicated as (
    select distinct on (candidate_key)
      raw.*
    from raw_candidates raw
    order by candidate_key, evidence_rank desc, clicked_at desc, click_id
  ), ranked as (
    select
      candidate.*,
      row_number() over (
        order by evidence_rank desc, clicked_at desc, candidate_key asc
      ) candidate_rank
    from deduplicated candidate
  ), serialized as (
    select
      candidate_rank,
      jsonb_strip_nulls(jsonb_build_object(
        'candidateKey', candidate_key,
        'rank', candidate_rank,
        'matchType', match_type,
        'confidence', confidence,
        'score', evidence_rank,
        'clickId', click_id,
        'clickedAt', clicked_at,
        'sourceId', source_id,
        'campaignId', campaign_id,
        'adGroupId', ad_group_id,
        'adId', ad_id,
        'sourceExternalId', source_external_id,
        'sourceName', source_name,
        'campaignExternalId', campaign_external_id,
        'campaignName', campaign_name,
        'adGroupExternalId', ad_group_external_id,
        'adGroupName', ad_group_name,
        'adExternalId', ad_external_id,
        'adName', ad_name,
        'decisionReason', case
          when candidate_rank = 1 then decision_reason
          else decision_reason || ' Perdió frente a una evidencia de mayor prioridad o más reciente.'
        end,
        'evidence', evidence
      )) value
    from ranked
  )
  select
    jsonb_agg(value order by candidate_rank),
    (jsonb_agg(value order by candidate_rank) -> 0)
  into candidate_list, winning_candidate
  from serialized;

  return jsonb_build_object(
    'organizationId', installation_row.organization_id,
    'appId', requested_app_id,
    'installationId', requested_installation_id,
    'scope', requested_scope,
    'engagementId', requested_engagement_id,
    'observedAt', requested_observed_at,
    'ruleVersion', rule_row.version,
    'ruleStatus', rule_row.status,
    'model', rule_row.model,
    'attributionWindowSeconds', window_seconds,
    'probabilisticEnabled', rule_row.probabilistic_enabled,
    'winner', winning_candidate,
    'candidates', coalesce(candidate_list, '[]'::jsonb),
    'deterministic', coalesce(winning_candidate ->> 'matchType', 'organic') in (
      'direct_link', 'install_referrer', 'network_signal', 'manual'
    )
  );
end;
$$;

comment on function private.evaluate_attribution(
  uuid, uuid, public.attribution_scope, uuid, timestamptz, jsonb, text
) is
  'Pure versioned evaluator. Ranks evidence deterministically and returns minimized explanations without persisting.';

create or replace function public.attribute_installation(
  requested_app_id uuid,
  requested_installation_id uuid,
  requested_scope public.attribution_scope,
  requested_engagement_id uuid,
  requested_observed_at timestamptz,
  provided_evidence jsonb default '{}'::jsonb,
  requested_rule_version text default null,
  dry_run boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  evaluation jsonb;
  candidate jsonb;
  winner jsonb;
  current_decision jsonb;
  winner_candidate_id uuid;
  changed boolean;
begin
  evaluation := private.evaluate_attribution(
    requested_app_id,
    requested_installation_id,
    requested_scope,
    requested_engagement_id,
    requested_observed_at,
    provided_evidence,
    requested_rule_version
  );
  winner := evaluation -> 'winner';

  select jsonb_strip_nulls(jsonb_build_object(
    'id', attribution.id,
    'ruleVersion', attribution.rule_version,
    'matchType', attribution.match_type,
    'clickId', attribution.click_id,
    'sourceId', attribution.source_id,
    'campaignId', attribution.campaign_id,
    'adGroupId', attribution.ad_group_id,
    'adId', attribution.ad_id,
    'confidence', attribution.confidence,
    'decisionReason', attribution.decision_reason,
    'attributedAt', attribution.attributed_at
  )) into current_decision
  from public.attributions attribution
  where attribution.app_id = requested_app_id
    and attribution.installation_id = requested_installation_id
    and attribution.scope = requested_scope
    and attribution.engagement_id = requested_engagement_id
    and attribution.is_current
  limit 1;

  changed := current_decision is null
    or coalesce(current_decision ->> 'ruleVersion', '') <> coalesce(evaluation ->> 'ruleVersion', '')
    or coalesce(current_decision ->> 'matchType', '') <> coalesce(winner ->> 'matchType', '')
    or coalesce(current_decision ->> 'clickId', '') <> coalesce(winner ->> 'clickId', '')
    or coalesce(current_decision ->> 'sourceId', '') <> coalesce(winner ->> 'sourceId', '')
    or coalesce(current_decision ->> 'campaignId', '') <> coalesce(winner ->> 'campaignId', '')
    or coalesce(current_decision ->> 'adGroupId', '') <> coalesce(winner ->> 'adGroupId', '')
    or coalesce(current_decision ->> 'adId', '') <> coalesce(winner ->> 'adId', '');

  if dry_run then
    return evaluation || jsonb_build_object(
      'dryRun', true,
      'wouldChange', changed,
      'current', current_decision
    );
  end if;

  update public.attribution_candidates existing
  set is_winner = false
  where existing.app_id = requested_app_id
    and existing.installation_id = requested_installation_id
    and existing.scope = requested_scope
    and existing.engagement_id = requested_engagement_id
    and existing.rule_version = evaluation ->> 'ruleVersion';

  for candidate in
    select value from jsonb_array_elements(evaluation -> 'candidates') item(value)
  loop
    insert into public.attribution_candidates (
      organization_id,
      app_id,
      installation_id,
      scope,
      engagement_id,
      click_id,
      source_id,
      campaign_id,
      ad_group_id,
      ad_id,
      candidate_key,
      method,
      match_type,
      confidence,
      score,
      evidence,
      attribution_window_seconds,
      decision_reason,
      is_winner,
      source_external_id,
      source_name,
      campaign_external_id,
      campaign_name,
      ad_group_external_id,
      ad_group_name,
      ad_external_id,
      ad_name,
      rule_version,
      observed_at
    ) values (
      (evaluation ->> 'organizationId')::uuid,
      requested_app_id,
      requested_installation_id,
      requested_scope,
      requested_engagement_id,
      nullif(candidate ->> 'clickId', '')::uuid,
      nullif(candidate ->> 'sourceId', '')::uuid,
      nullif(candidate ->> 'campaignId', '')::uuid,
      nullif(candidate ->> 'adGroupId', '')::uuid,
      nullif(candidate ->> 'adId', '')::uuid,
      candidate ->> 'candidateKey',
      (candidate ->> 'matchType')::public.attribution_method,
      (candidate ->> 'matchType')::public.attribution_method,
      (candidate ->> 'confidence')::numeric,
      (candidate ->> 'score')::integer,
      candidate -> 'evidence',
      (evaluation ->> 'attributionWindowSeconds')::integer,
      candidate ->> 'decisionReason',
      (candidate ->> 'rank')::integer = 1,
      candidate ->> 'sourceExternalId',
      candidate ->> 'sourceName',
      candidate ->> 'campaignExternalId',
      candidate ->> 'campaignName',
      candidate ->> 'adGroupExternalId',
      candidate ->> 'adGroupName',
      candidate ->> 'adExternalId',
      candidate ->> 'adName',
      evaluation ->> 'ruleVersion',
      requested_observed_at
    )
    on conflict on constraint attribution_candidates_unique_key do update
    set click_id = excluded.click_id,
        source_id = excluded.source_id,
        campaign_id = excluded.campaign_id,
        ad_group_id = excluded.ad_group_id,
        ad_id = excluded.ad_id,
        method = excluded.method,
        match_type = excluded.match_type,
        confidence = excluded.confidence,
        score = excluded.score,
        evidence = excluded.evidence,
        attribution_window_seconds = excluded.attribution_window_seconds,
        decision_reason = excluded.decision_reason,
        is_winner = excluded.is_winner,
        source_external_id = excluded.source_external_id,
        source_name = excluded.source_name,
        campaign_external_id = excluded.campaign_external_id,
        campaign_name = excluded.campaign_name,
        ad_group_external_id = excluded.ad_group_external_id,
        ad_group_name = excluded.ad_group_name,
        ad_external_id = excluded.ad_external_id,
        ad_name = excluded.ad_name,
        observed_at = excluded.observed_at;
  end loop;

  select candidate_row.id into winner_candidate_id
  from public.attribution_candidates candidate_row
  where candidate_row.app_id = requested_app_id
    and candidate_row.installation_id = requested_installation_id
    and candidate_row.scope = requested_scope
    and candidate_row.engagement_id = requested_engagement_id
    and candidate_row.rule_version = evaluation ->> 'ruleVersion'
    and candidate_row.candidate_key = winner ->> 'candidateKey';

  update public.attributions attribution
  set is_current = false,
      updated_at = statement_timestamp()
  where attribution.app_id = requested_app_id
    and attribution.installation_id = requested_installation_id
    and attribution.scope = requested_scope
    and attribution.engagement_id = requested_engagement_id
    and attribution.is_current;

  insert into public.attributions (
    organization_id,
    app_id,
    installation_id,
    scope,
    engagement_id,
    winning_candidate_id,
    click_id,
    source_id,
    campaign_id,
    ad_group_id,
    ad_id,
    method,
    match_type,
    confidence,
    evidence_summary,
    attribution_window_days,
    attribution_window_seconds,
    decision_reason,
    is_manual,
    source_external_id,
    source_name,
    campaign_external_id,
    campaign_name,
    ad_group_external_id,
    ad_group_name,
    ad_external_id,
    ad_name,
    rule_version,
    attributed_at,
    is_current
  ) values (
    (evaluation ->> 'organizationId')::uuid,
    requested_app_id,
    requested_installation_id,
    requested_scope,
    requested_engagement_id,
    winner_candidate_id,
    nullif(winner ->> 'clickId', '')::uuid,
    nullif(winner ->> 'sourceId', '')::uuid,
    nullif(winner ->> 'campaignId', '')::uuid,
    nullif(winner ->> 'adGroupId', '')::uuid,
    nullif(winner ->> 'adId', '')::uuid,
    (winner ->> 'matchType')::public.attribution_method,
    (winner ->> 'matchType')::public.attribution_method,
    (winner ->> 'confidence')::numeric,
    winner -> 'evidence',
    greatest(1, ceil((evaluation ->> 'attributionWindowSeconds')::numeric / 86400)::integer),
    (evaluation ->> 'attributionWindowSeconds')::integer,
    winner ->> 'decisionReason',
    false,
    winner ->> 'sourceExternalId',
    winner ->> 'sourceName',
    winner ->> 'campaignExternalId',
    winner ->> 'campaignName',
    winner ->> 'adGroupExternalId',
    winner ->> 'adGroupName',
    winner ->> 'adExternalId',
    winner ->> 'adName',
    evaluation ->> 'ruleVersion',
    requested_observed_at,
    true
  )
  on conflict (app_id, installation_id, scope, engagement_id, rule_version) do update
  set winning_candidate_id = excluded.winning_candidate_id,
      click_id = excluded.click_id,
      source_id = excluded.source_id,
      campaign_id = excluded.campaign_id,
      ad_group_id = excluded.ad_group_id,
      ad_id = excluded.ad_id,
      method = excluded.method,
      match_type = excluded.match_type,
      confidence = excluded.confidence,
      evidence_summary = excluded.evidence_summary,
      attribution_window_days = excluded.attribution_window_days,
      attribution_window_seconds = excluded.attribution_window_seconds,
      decision_reason = excluded.decision_reason,
      is_manual = false,
      source_external_id = excluded.source_external_id,
      source_name = excluded.source_name,
      campaign_external_id = excluded.campaign_external_id,
      campaign_name = excluded.campaign_name,
      ad_group_external_id = excluded.ad_group_external_id,
      ad_group_name = excluded.ad_group_name,
      ad_external_id = excluded.ad_external_id,
      ad_name = excluded.ad_name,
      attributed_at = excluded.attributed_at,
      is_current = true,
      updated_at = statement_timestamp();

  return evaluation || jsonb_build_object(
    'dryRun', false,
    'wouldChange', changed,
    'currentBefore', current_decision
  );
end;
$$;

revoke all on function public.attribute_installation(
  uuid, uuid, public.attribution_scope, uuid, timestamptz, jsonb, text, boolean
) from public, anon, authenticated;
grant execute on function public.attribute_installation(
  uuid, uuid, public.attribution_scope, uuid, timestamptz, jsonb, text, boolean
) to service_role;

comment on function public.attribute_installation(
  uuid, uuid, public.attribution_scope, uuid, timestamptz, jsonb, text, boolean
) is
  'Service-only idempotent attribution entrypoint. dry_run evaluates and compares without changing candidates or decisions.';

create or replace function public.get_attribution_explanation(
  requested_app_id uuid,
  requested_installation_id uuid,
  requested_scope public.attribution_scope default 'acquisition',
  requested_engagement_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'attribution', jsonb_strip_nulls(jsonb_build_object(
      'id', attribution.id,
      'scope', attribution.scope,
      'engagementId', attribution.engagement_id,
      'matchType', attribution.match_type,
      'confidence', attribution.confidence,
      'deterministic', attribution.match_type in ('direct_link', 'install_referrer', 'network_signal', 'manual'),
      'decisionReason', attribution.decision_reason,
      'evidenceSummary', attribution.evidence_summary,
      'attributionWindowSeconds', attribution.attribution_window_seconds,
      'attributedAt', attribution.attributed_at,
      'ruleVersion', attribution.rule_version,
      'isManual', attribution.is_manual,
      'clickId', attribution.click_id,
      'source', jsonb_strip_nulls(jsonb_build_object(
        'id', attribution.source_id,
        'externalId', attribution.source_external_id,
        'name', attribution.source_name
      )),
      'campaign', jsonb_strip_nulls(jsonb_build_object(
        'id', attribution.campaign_id,
        'externalId', attribution.campaign_external_id,
        'name', attribution.campaign_name
      )),
      'adGroup', jsonb_strip_nulls(jsonb_build_object(
        'id', attribution.ad_group_id,
        'externalId', attribution.ad_group_external_id,
        'name', attribution.ad_group_name
      )),
      'ad', jsonb_strip_nulls(jsonb_build_object(
        'id', attribution.ad_id,
        'externalId', attribution.ad_external_id,
        'name', attribution.ad_name
      ))
    )),
    'candidates', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', candidate.id,
        'candidateKey', candidate.candidate_key,
        'matchType', candidate.match_type,
        'confidence', candidate.confidence,
        'score', candidate.score,
        'isWinner', candidate.is_winner,
        'decisionReason', candidate.decision_reason,
        'evidence', candidate.evidence,
        'clickId', candidate.click_id,
        'sourceName', candidate.source_name,
        'campaignName', candidate.campaign_name,
        'adGroupName', candidate.ad_group_name,
        'adName', candidate.ad_name,
        'observedAt', candidate.observed_at
      )) order by candidate.is_winner desc, candidate.score desc, candidate.observed_at desc, candidate.candidate_key)
      from public.attribution_candidates candidate
      where candidate.app_id = attribution.app_id
        and candidate.installation_id = attribution.installation_id
        and candidate.scope = attribution.scope
        and candidate.engagement_id = attribution.engagement_id
        and candidate.rule_version = attribution.rule_version
    ), '[]'::jsonb)
  )
  from public.attributions attribution
  where attribution.app_id = requested_app_id
    and attribution.installation_id = requested_installation_id
    and attribution.scope = requested_scope
    and attribution.engagement_id = coalesce(requested_engagement_id, requested_installation_id)
    and attribution.is_current
  limit 1;
$$;

revoke all on function public.get_attribution_explanation(
  uuid, uuid, public.attribution_scope, uuid
) from public, anon;
grant execute on function public.get_attribution_explanation(
  uuid, uuid, public.attribution_scope, uuid
) to authenticated, service_role;

create or replace function public.recalculate_personal_attribution(
  requested_app_id uuid,
  requested_installation_id uuid,
  requested_scope public.attribution_scope,
  requested_engagement_id uuid,
  requested_observed_at timestamptz,
  provided_evidence jsonb default '{}'::jsonb,
  requested_rule_version text default null,
  dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_organization_id uuid;
  result jsonb;
begin
  select app.organization_id into requested_organization_id
  from public.apps app
  where app.id = requested_app_id;

  if requested_organization_id is null
    or not private.has_organization_role(
      requested_organization_id,
      array['owner', 'admin']::public.organization_role[]
    ) then
    raise exception 'attribution_admin_required' using errcode = '42501';
  end if;

  result := public.attribute_installation(
    requested_app_id,
    requested_installation_id,
    requested_scope,
    requested_engagement_id,
    requested_observed_at,
    provided_evidence,
    requested_rule_version,
    dry_run
  );

  if not dry_run then
    insert into public.audit_log (
      organization_id, app_id, actor_user_id, actor_kind, action,
      target_table, target_id, before_state, after_state
    ) values (
      requested_organization_id,
      requested_app_id,
      (select auth.uid()),
      'user',
      'attribution.recalculated',
      'installation',
      requested_installation_id,
      result -> 'currentBefore',
      result -> 'winner'
    );
  end if;

  return result;
end;
$$;

revoke all on function public.recalculate_personal_attribution(
  uuid, uuid, public.attribution_scope, uuid, timestamptz, jsonb, text, boolean
) from public, anon;
grant execute on function public.recalculate_personal_attribution(
  uuid, uuid, public.attribution_scope, uuid, timestamptz, jsonb, text, boolean
) to authenticated;

create or replace function public.correct_personal_attribution(
  requested_app_id uuid,
  requested_installation_id uuid,
  requested_scope public.attribution_scope,
  requested_engagement_id uuid,
  correction jsonb,
  correction_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_organization_id uuid;
  installation_row public.installations%rowtype;
  correction_id uuid := gen_random_uuid();
  correction_version text := 'manual-' || correction_id::text;
  candidate_id uuid;
  before_state jsonb;
  after_state jsonb;
  selected_click_id uuid := nullif(correction ->> 'clickId', '')::uuid;
  selected_source_id uuid := nullif(correction ->> 'sourceId', '')::uuid;
  selected_campaign_id uuid := nullif(correction ->> 'campaignId', '')::uuid;
  selected_ad_group_id uuid := nullif(correction ->> 'adGroupId', '')::uuid;
  selected_ad_id uuid := nullif(correction ->> 'adId', '')::uuid;
  snapshot_source_external_id text;
  snapshot_source_name text;
  snapshot_campaign_external_id text;
  snapshot_campaign_name text;
  snapshot_ad_group_external_id text;
  snapshot_ad_group_name text;
  snapshot_ad_external_id text;
  snapshot_ad_name text;
begin
  if correction is null or jsonb_typeof(correction) <> 'object'
    or length(btrim(coalesce(correction_reason, ''))) < 8 then
    raise exception 'manual_correction_requires_reason' using errcode = '22023';
  end if;

  select installation.* into installation_row
  from public.installations installation
  where installation.app_id = requested_app_id
    and installation.id = requested_installation_id;
  if not found then
    raise exception 'installation_not_found' using errcode = 'P0002';
  end if;
  requested_organization_id := installation_row.organization_id;

  if not private.has_organization_role(
    requested_organization_id,
    array['owner', 'admin']::public.organization_role[]
  ) then
    raise exception 'attribution_admin_required' using errcode = '42501';
  end if;

  if requested_scope = 'acquisition' and requested_engagement_id <> requested_installation_id then
    raise exception 'invalid_acquisition_engagement' using errcode = '22023';
  end if;
  if requested_scope = 'reengagement' and not exists (
    select 1 from public.sessions session
    where session.id = requested_engagement_id
      and session.installation_id = requested_installation_id
      and session.app_id = requested_app_id
  ) then
    raise exception 'reengagement_session_not_found' using errcode = 'P0002';
  end if;

  select jsonb_strip_nulls(jsonb_build_object(
    'id', attribution.id,
    'matchType', attribution.match_type,
    'clickId', attribution.click_id,
    'sourceId', attribution.source_id,
    'campaignId', attribution.campaign_id,
    'adGroupId', attribution.ad_group_id,
    'adId', attribution.ad_id,
    'ruleVersion', attribution.rule_version,
    'decisionReason', attribution.decision_reason
  )) into before_state
  from public.attributions attribution
  where attribution.app_id = requested_app_id
    and attribution.installation_id = requested_installation_id
    and attribution.scope = requested_scope
    and attribution.engagement_id = requested_engagement_id
    and attribution.is_current;

  select external_id, name into snapshot_source_external_id, snapshot_source_name
  from public.sources where id = selected_source_id;
  select external_id, name into snapshot_campaign_external_id, snapshot_campaign_name
  from public.campaigns where id = selected_campaign_id;
  select external_id, name into snapshot_ad_group_external_id, snapshot_ad_group_name
  from public.ad_groups where id = selected_ad_group_id;
  select external_id, name into snapshot_ad_external_id, snapshot_ad_name
  from public.ads where id = selected_ad_id;

  insert into public.attribution_candidates (
    organization_id, app_id, installation_id, scope, engagement_id,
    click_id, source_id, campaign_id, ad_group_id, ad_id,
    candidate_key, method, match_type, confidence, score, evidence,
    attribution_window_seconds, decision_reason, is_winner,
    source_external_id, source_name, campaign_external_id, campaign_name,
    ad_group_external_id, ad_group_name, ad_external_id, ad_name,
    rule_version, observed_at
  ) values (
    requested_organization_id, requested_app_id, requested_installation_id,
    requested_scope, requested_engagement_id,
    selected_click_id, selected_source_id, selected_campaign_id, selected_ad_group_id, selected_ad_id,
    'manual:' || correction_id::text, 'manual', 'manual', 1, 1000,
    jsonb_build_object('signal', 'manual_correction', 'reason', btrim(correction_reason)),
    60, 'Corrección manual: ' || btrim(correction_reason), true,
    snapshot_source_external_id, snapshot_source_name,
    snapshot_campaign_external_id, snapshot_campaign_name,
    snapshot_ad_group_external_id, snapshot_ad_group_name,
    snapshot_ad_external_id, snapshot_ad_name,
    correction_version, statement_timestamp()
  ) returning id into candidate_id;

  update public.attributions attribution
  set is_current = false,
      updated_at = statement_timestamp()
  where attribution.app_id = requested_app_id
    and attribution.installation_id = requested_installation_id
    and attribution.scope = requested_scope
    and attribution.engagement_id = requested_engagement_id
    and attribution.is_current;

  insert into public.attributions (
    organization_id, app_id, installation_id, scope, engagement_id,
    winning_candidate_id, click_id, source_id, campaign_id, ad_group_id, ad_id,
    method, match_type, confidence, evidence_summary,
    attribution_window_days, attribution_window_seconds, decision_reason, is_manual,
    source_external_id, source_name, campaign_external_id, campaign_name,
    ad_group_external_id, ad_group_name, ad_external_id, ad_name,
    rule_version, attributed_at, is_current
  ) values (
    requested_organization_id, requested_app_id, requested_installation_id,
    requested_scope, requested_engagement_id,
    candidate_id, selected_click_id, selected_source_id, selected_campaign_id,
    selected_ad_group_id, selected_ad_id,
    'manual', 'manual', 1,
    jsonb_build_object('signal', 'manual_correction', 'reason', btrim(correction_reason)),
    1, 60, 'Corrección manual: ' || btrim(correction_reason), true,
    snapshot_source_external_id, snapshot_source_name,
    snapshot_campaign_external_id, snapshot_campaign_name,
    snapshot_ad_group_external_id, snapshot_ad_group_name,
    snapshot_ad_external_id, snapshot_ad_name,
    correction_version, statement_timestamp(), true
  ) returning jsonb_strip_nulls(jsonb_build_object(
    'id', id,
    'scope', scope,
    'engagementId', engagement_id,
    'matchType', match_type,
    'clickId', click_id,
    'sourceId', source_id,
    'campaignId', campaign_id,
    'adGroupId', ad_group_id,
    'adId', ad_id,
    'ruleVersion', rule_version,
    'decisionReason', decision_reason
  )) into after_state;

  insert into public.audit_log (
    organization_id, app_id, actor_user_id, actor_kind, action,
    target_table, target_id, before_state, after_state
  ) values (
    requested_organization_id,
    requested_app_id,
    (select auth.uid()),
    'user',
    'attribution.corrected',
    'installation',
    requested_installation_id,
    before_state,
    after_state || jsonb_build_object('reason', btrim(correction_reason))
  );

  return after_state;
end;
$$;

revoke all on function public.correct_personal_attribution(
  uuid, uuid, public.attribution_scope, uuid, jsonb, text
) from public, anon;
grant execute on function public.correct_personal_attribution(
  uuid, uuid, public.attribution_scope, uuid, jsonb, text
) to authenticated;

comment on function public.correct_personal_attribution(
  uuid, uuid, public.attribution_scope, uuid, jsonb, text
) is
  'Owner/admin-only audited manual correction. The reason is mandatory and the previous decision remains historical.';

create or replace function public.resolve_ingest_app_key(provided_key_hash text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'keyId', sdk_key.id,
    'organizationId', sdk_key.organization_id,
    'appId', sdk_key.app_id,
    'environment', sdk_key.environment,
    'status', sdk_key.status,
    'appStatus', app.status,
    'maxBatchEvents', sdk_key.max_batch_events,
    'maxRequestBytes', sdk_key.max_request_bytes,
    'allowedSdkPrefixes', to_jsonb(sdk_key.allowed_sdk_prefixes),
    'allowedPlatforms', to_jsonb(sdk_key.allowed_platforms),
    'attestationMode', sdk_key.attestation_mode,
    'cacheTtlSeconds', sdk_key.cache_ttl_seconds,
    'probabilisticEnabled', coalesce(rule.probabilistic_enabled, false)
  )
  from public.public_sdk_keys sdk_key
  join public.apps app
    on app.id = sdk_key.app_id
   and app.organization_id = sdk_key.organization_id
  left join public.attribution_rule_sets rule
    on rule.app_id = sdk_key.app_id
   and rule.organization_id = sdk_key.organization_id
   and rule.status = 'active'
  where provided_key_hash ~ '^[a-f0-9]{64}$'
    and pg_catalog.encode(sdk_key.key_hash, 'hex') = provided_key_hash
  limit 1;
$$;

create or replace function public.read_sdk_attribution(
  requested_app_id uuid,
  requested_installation_id uuid,
  provided_token_hash text
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'method', attribution.method,
    'matchType', attribution.match_type,
    'scope', attribution.scope,
    'confidence', attribution.confidence,
    'deterministic', attribution.match_type in ('direct_link', 'install_referrer', 'network_signal', 'manual'),
    'attributedAt', attribution.attributed_at,
    'ruleVersion', attribution.rule_version,
    'source', coalesce(attribution.source_name, source.name),
    'campaign', coalesce(attribution.campaign_name, campaign.name),
    'adGroup', coalesce(attribution.ad_group_name, ad_group.name),
    'ad', coalesce(attribution.ad_name, ad.name)
  ))
  from public.installations installation
  join public.attributions attribution
    on attribution.installation_id = installation.id
   and attribution.organization_id = installation.organization_id
   and attribution.app_id = installation.app_id
   and attribution.scope = 'acquisition'
   and attribution.engagement_id = installation.id
   and attribution.is_current
  left join public.sources source on source.id = attribution.source_id
  left join public.campaigns campaign on campaign.id = attribution.campaign_id
  left join public.ad_groups ad_group on ad_group.id = attribution.ad_group_id
  left join public.ads ad on ad.id = attribution.ad_id
  where installation.app_id = requested_app_id
    and installation.id = requested_installation_id
    and provided_token_hash ~ '^[a-f0-9]{64}$'
    and installation.installation_access_token_hash is not null
    and pg_catalog.encode(installation.installation_access_token_hash, 'hex') = provided_token_hash
  limit 1;
$$;

create or replace function private.persist_sdk_messages_base(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_variable
declare
  message jsonb;
  event_body jsonb;
  body jsonb;
  message_count integer;
  persisted_installations integer := 0;
  persisted_identities integer := 0;
  persisted_events integer := 0;
  organization_id uuid;
  app_id uuid;
  installation_id uuid;
  event_id uuid;
  inserted_event_id uuid;
  session_id uuid;
  occurred_at timestamptz;
  platform public.app_platform_kind;
  environment public.environment_kind;
  identity_value text;
  value_minor bigint;
  currency text;
  affected integer;
begin
  if payload is null
    or jsonb_typeof(payload) <> 'object'
    or jsonb_typeof(payload -> 'messages') <> 'array'
    or pg_column_size(payload) > 16777216 then
    raise exception 'invalid_ingest_payload' using errcode = '22023';
  end if;

  message_count := jsonb_array_length(payload -> 'messages');
  if message_count < 1 or message_count > 50 then
    raise exception 'invalid_ingest_batch_size' using errcode = '22023';
  end if;

  for message in
    select value from jsonb_array_elements(payload -> 'messages') item(value)
  loop
    organization_id := (message ->> 'organizationId')::uuid;
    app_id := (message ->> 'appId')::uuid;
    environment := (message ->> 'environment')::public.environment_kind;
    body := message -> 'body';

    if not exists (
      select 1
      from public.public_sdk_keys sdk_key
      join public.apps app
        on app.id = sdk_key.app_id
       and app.organization_id = sdk_key.organization_id
       and app.status = 'active'
      where sdk_key.id = (message ->> 'keyId')::uuid
        and sdk_key.organization_id = organization_id
        and sdk_key.app_id = app_id
        and sdk_key.environment = environment
        and sdk_key.status = 'active'
    ) then
      raise exception 'invalid_ingest_scope' using errcode = '42501';
    end if;

    if message ->> 'kind' in ('installation', 'identify') then
      installation_id := (body ->> 'installationId')::uuid;
      occurred_at := (body ->> 'occurredAt')::timestamptz;
      platform := (body ->> 'platform')::public.app_platform_kind;

      if exists (
        select 1 from public.installations installation
        where installation.id = installation_id
          and (installation.organization_id <> organization_id or installation.app_id <> app_id)
      ) then
        raise exception 'installation_scope_collision' using errcode = '23505';
      end if;

      insert into public.installations (
        id, organization_id, app_id, installation_key_hash, platform, environment,
        first_open_at, last_seen_at, app_version, sdk_version, consent_state,
        installation_access_token_hash, attestation_status
      ) values (
        installation_id,
        organization_id,
        app_id,
        extensions.digest(installation_id::text, 'sha256'),
        platform,
        environment,
        occurred_at,
        occurred_at,
        body ->> 'appVersion',
        body ->> 'sdkVersion',
        case
          when message ->> 'kind' = 'installation' then coalesce(body ->> 'consent', 'limited')
          else 'granted'
        end,
        case
          when message ->> 'accessTokenHash' ~ '^[a-f0-9]{64}$'
            then pg_catalog.decode(message ->> 'accessTokenHash', 'hex')
        end,
        coalesce(message ->> 'attestation', 'absent')
      )
      on conflict (id) do update
      set last_seen_at = greatest(public.installations.last_seen_at, excluded.last_seen_at),
          app_version = coalesce(excluded.app_version, public.installations.app_version),
          sdk_version = coalesce(excluded.sdk_version, public.installations.sdk_version),
          consent_state = case
            when message ->> 'kind' = 'installation' then excluded.consent_state
            else public.installations.consent_state
          end,
          installation_access_token_hash = coalesce(
            excluded.installation_access_token_hash,
            public.installations.installation_access_token_hash
          ),
          attestation_status = case
            when excluded.attestation_status = 'verified' then 'verified'
            else public.installations.attestation_status
          end,
          updated_at = statement_timestamp()
      where public.installations.organization_id = excluded.organization_id
        and public.installations.app_id = excluded.app_id;
      get diagnostics affected = row_count;
      persisted_installations := persisted_installations + affected;

      identity_value := body ->> 'anonymousId';
      if identity_value is not null then
        insert into public.identities (
          organization_id, app_id, installation_id, identity_kind,
          identity_hash, traits, valid_from
        ) values (
          organization_id, app_id, installation_id, 'anonymous',
          extensions.digest(identity_value, 'sha256'), '{}'::jsonb, occurred_at
        ) on conflict do nothing;
        get diagnostics affected = row_count;
        persisted_identities := persisted_identities + affected;
      end if;

      if message ->> 'kind' = 'identify' then
        insert into public.identities (
          organization_id, app_id, installation_id, identity_kind,
          identity_hash, traits, valid_from
        ) values (
          organization_id, app_id, installation_id, 'user',
          extensions.digest(body ->> 'userId', 'sha256'),
          coalesce(body -> 'traits', '{}'::jsonb), occurred_at
        ) on conflict do nothing;
        get diagnostics affected = row_count;
        persisted_identities := persisted_identities + affected;
      end if;
    elsif message ->> 'kind' = 'events' then
      platform := (body ->> 'platform')::public.app_platform_kind;

      for event_body in
        select value from jsonb_array_elements(body -> 'events') item(value)
      loop
        installation_id := (event_body ->> 'installationId')::uuid;
        event_id := (event_body ->> 'eventId')::uuid;
        session_id := (event_body ->> 'sessionId')::uuid;
        occurred_at := (event_body ->> 'occurredAt')::timestamptz;

        if exists (
          select 1 from public.installations installation
          where installation.id = installation_id
            and (installation.organization_id <> organization_id or installation.app_id <> app_id)
        ) then
          raise exception 'installation_scope_collision' using errcode = '23505';
        end if;

        insert into public.installations (
          id, organization_id, app_id, installation_key_hash, platform, environment,
          first_open_at, last_seen_at, sdk_version, consent_state,
          installation_access_token_hash, attestation_status
        ) values (
          installation_id, organization_id, app_id,
          extensions.digest(installation_id::text, 'sha256'), platform, environment,
          occurred_at, occurred_at, body ->> 'sdkVersion', 'granted',
          case
            when message ->> 'accessTokenHash' ~ '^[a-f0-9]{64}$'
              then pg_catalog.decode(message ->> 'accessTokenHash', 'hex')
          end,
          coalesce(message ->> 'attestation', 'absent')
        )
        on conflict (id) do update
        set last_seen_at = greatest(public.installations.last_seen_at, excluded.last_seen_at),
            sdk_version = coalesce(excluded.sdk_version, public.installations.sdk_version),
            installation_access_token_hash = coalesce(
              excluded.installation_access_token_hash,
              public.installations.installation_access_token_hash
            ),
            attestation_status = case
              when excluded.attestation_status = 'verified' then 'verified'
              else public.installations.attestation_status
            end,
            updated_at = statement_timestamp()
        where public.installations.organization_id = excluded.organization_id
          and public.installations.app_id = excluded.app_id;

        insert into public.sessions (
          id, organization_id, app_id, installation_id, session_key, started_at
        ) values (
          session_id, organization_id, app_id, installation_id,
          session_id::text, occurred_at
        )
        on conflict (id) do update
        set started_at = least(public.sessions.started_at, excluded.started_at),
            updated_at = statement_timestamp()
        where public.sessions.organization_id = excluded.organization_id
          and public.sessions.app_id = excluded.app_id
          and public.sessions.installation_id = excluded.installation_id;

        value_minor := case
          when event_body -> 'properties' ->> 'valueMinor' ~ '^-?[0-9]+$'
            then (event_body -> 'properties' ->> 'valueMinor')::bigint
        end;
        currency := case
          when event_body -> 'properties' ->> 'currency' ~ '^[A-Z]{3}$'
            then event_body -> 'properties' ->> 'currency'
        end;
        if value_minor is null or currency is null then
          value_minor := null;
          currency := null;
        end if;

        inserted_event_id := null;
        insert into public.events (
          id, organization_id, app_id, installation_id, session_id,
          event_id, idempotency_key, name, occurred_at, received_at,
          properties, value_minor, currency
        ) values (
          event_id, organization_id, app_id, installation_id, session_id,
          event_id, event_body ->> 'idempotencyKey', event_body ->> 'name',
          occurred_at, (message ->> 'receivedAt')::timestamptz,
          coalesce(event_body -> 'properties', '{}'::jsonb), value_minor, currency
        )
        on conflict do nothing
        returning id into inserted_event_id;

        if inserted_event_id is not null then
          persisted_events := persisted_events + 1;

          if event_body ->> 'name' = 'purchase' then
            insert into public.purchases (
              organization_id, app_id, installation_id, event_id,
              transaction_id, order_id, value_minor, currency, purchased_at
            ) values (
              organization_id, app_id, installation_id, inserted_event_id,
              event_body -> 'properties' ->> 'transactionId',
              event_body -> 'properties' ->> 'orderId',
              value_minor, currency, occurred_at
            ) on conflict do nothing;
          elsif event_body ->> 'name' in ('subscription_started', 'subscription_renewed') then
            insert into public.subscriptions (
              organization_id, app_id, installation_id, external_subscription_id,
              product_id, platform, status, current_period_started_at,
              revenue_minor, currency
            ) values (
              organization_id, app_id, installation_id,
              event_body -> 'properties' ->> 'subscriptionId',
              event_body -> 'properties' ->> 'productId',
              platform, 'active', occurred_at, value_minor, currency
            )
            on conflict (app_id, external_subscription_id) do update
            set status = 'active',
                product_id = excluded.product_id,
                revenue_minor = public.subscriptions.revenue_minor + excluded.revenue_minor,
                currency = excluded.currency,
                updated_at = statement_timestamp();
          elsif event_body ->> 'name' = 'subscription_cancelled' then
            update public.subscriptions subscription
            set status = 'cancelled',
                cancelled_at = occurred_at,
                updated_at = statement_timestamp()
            where subscription.app_id = app_id
              and subscription.external_subscription_id = event_body -> 'properties' ->> 'subscriptionId';
          end if;
        end if;

        identity_value := event_body ->> 'anonymousId';
        if identity_value is not null then
          insert into public.identities (
            organization_id, app_id, installation_id, identity_kind,
            identity_hash, traits, valid_from
          ) values (
            organization_id, app_id, installation_id, 'anonymous',
            extensions.digest(identity_value, 'sha256'), '{}'::jsonb, occurred_at
          ) on conflict do nothing;
        end if;
      end loop;

      if jsonb_typeof(body -> 'identity') = 'object' then
        insert into public.identities (
          organization_id, app_id, installation_id, identity_kind,
          identity_hash, traits, valid_from
        ) values (
          organization_id, app_id, installation_id, 'user',
          extensions.digest(body -> 'identity' ->> 'userId', 'sha256'),
          coalesce(body -> 'identity' -> 'traits', '{}'::jsonb),
          (message ->> 'receivedAt')::timestamptz
        ) on conflict do nothing;
      end if;

      update public.sessions session
      set event_count = (
        select count(*)::integer from public.events event
        where event.app_id = session.app_id and event.session_id = session.id
      ),
          updated_at = statement_timestamp()
      where session.app_id = app_id
        and session.id in (
          select (item.value ->> 'sessionId')::uuid
          from jsonb_array_elements(body -> 'events') item(value)
        );
    end if;
  end loop;

  return jsonb_build_object(
    'messages', message_count,
    'installations', persisted_installations,
    'identities', persisted_identities,
    'events', persisted_events
  );
end;
$$;

create or replace function public.ingest_sdk_messages_v2(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  sanitized_payload jsonb;
  ingest_result jsonb;
  message jsonb;
  message_kind text;
  installation_id uuid;
  engagement_id uuid;
  attribution_scope public.attribution_scope;
  observed_at timestamptz;
  evidence jsonb;
  attributed_count integer := 0;
begin
  if payload is null
    or jsonb_typeof(payload) <> 'object'
    or jsonb_typeof(payload -> 'messages') <> 'array' then
    raise exception 'invalid_ingest_payload' using errcode = '22023';
  end if;

  select jsonb_set(
    payload,
    '{messages}',
    jsonb_agg(
      jsonb_set(item.value, '{body}', (item.value -> 'body') - 'attribution')
      order by item.ordinality
    )
  ) into sanitized_payload
  from jsonb_array_elements(payload -> 'messages') with ordinality item(value, ordinality);

  ingest_result := private.persist_sdk_messages_base(sanitized_payload);

  for message in
    select value from jsonb_array_elements(payload -> 'messages') item(value)
  loop
    message_kind := message ->> 'kind';
    attribution_scope := null;
    installation_id := null;
    engagement_id := null;

    if message_kind = 'installation' then
      installation_id := (message -> 'body' ->> 'installationId')::uuid;
      engagement_id := installation_id;
      attribution_scope := 'acquisition';
    elsif message_kind = 'events' and exists (
      select 1 from jsonb_array_elements(message -> 'body' -> 'events') event(value)
      where event.value ->> 'name' = 'install'
    ) then
      installation_id := ((message -> 'body' -> 'events' -> 0) ->> 'installationId')::uuid;
      engagement_id := installation_id;
      attribution_scope := 'acquisition';
    elsif message_kind = 'events' and exists (
      select 1 from jsonb_array_elements(message -> 'body' -> 'events') event(value)
      where event.value ->> 'name' in ('app_open', 'session_start')
    ) then
      installation_id := ((message -> 'body' -> 'events' -> 0) ->> 'installationId')::uuid;
      engagement_id := ((message -> 'body' -> 'events' -> 0) ->> 'sessionId')::uuid;
      attribution_scope := 'reengagement';
    end if;

    if attribution_scope is not null then
      observed_at := coalesce(
        nullif(message ->> 'receivedAt', '')::timestamptz,
        statement_timestamp()
      );
      evidence := coalesce(message -> 'body' -> 'attribution', '{}'::jsonb);
      if jsonb_typeof(message -> 'probabilisticEvidence') = 'object' then
        evidence := evidence || jsonb_build_object(
          'probabilisticEvidence', message -> 'probabilisticEvidence'
        );
      end if;

      perform public.attribute_installation(
        (message ->> 'appId')::uuid,
        installation_id,
        attribution_scope,
        engagement_id,
        observed_at,
        evidence,
        null,
        false
      );
      attributed_count := attributed_count + 1;
    end if;
  end loop;

  return ingest_result || jsonb_build_object('attributions', attributed_count);
end;
$$;

revoke all on function public.resolve_ingest_app_key(text) from public, anon, authenticated;
revoke all on function public.read_sdk_attribution(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.ingest_sdk_messages_v2(jsonb) from public, anon, authenticated;
grant execute on function public.resolve_ingest_app_key(text) to service_role;
grant execute on function public.read_sdk_attribution(uuid, uuid, text) to service_role;
grant execute on function public.ingest_sdk_messages_v2(jsonb) to service_role;

comment on function public.ingest_sdk_messages_v2(jsonb) is
  'Persists SDK messages through the existing idempotent ingest path, then evaluates acquisition or re-engagement with the active attribution rule.';

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_organization_member(uuid) to authenticated;
grant execute on function private.has_organization_role(uuid, public.organization_role[]) to authenticated;
grant execute on function private.create_default_attribution_rule_set() to service_role;
grant execute on function private.evaluate_attribution(
  uuid, uuid, public.attribution_scope, uuid, timestamptz, jsonb, text
) to service_role;
grant execute on function private.persist_sdk_messages_base(jsonb) to service_role;

comment on table public.attributions is
  'Versioned acquisition and re-engagement decisions. Historical names and external IDs are snapshotted so later campaign renames do not rewrite history.';

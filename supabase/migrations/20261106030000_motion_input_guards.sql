-- Require the complete bound input contract even for direct RPC callers.
create or replace function private.valid_render_input(i jsonb,w uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare settings jsonb; r public.motion_revisions;
begin
 settings:=jsonb_build_object('width',i->'width','height',i->'height','duration_seconds',i->'duration_seconds','fps',i->'fps');
 if not coalesce(jsonb_typeof(i)='object' and i ?& array['title','format','html','css','width','height','duration_seconds','fps','asset_ids'] and jsonb_typeof(i->'format')='string' and i->>'format' in ('png','mp4') and private.valid_motion_settings(settings) and jsonb_typeof(i->'title')='string' and char_length(i->>'title') between 1 and 120
 and jsonb_typeof(i->'html')='string' and jsonb_typeof(i->'css')='string' and jsonb_typeof(i->'asset_ids')='array',false) then return false; end if;
 if i->>'engine'='hyperframes' then
  if not i ?& array['engine','revision_id'] or jsonb_typeof(i->'revision_id')<>'string' or (select count(*) from jsonb_object_keys(i))<>11 or i->>'format'<>'mp4' or i->>'html'<>'' or i->>'css'<>'' or i->'asset_ids'<>'[]'::jsonb then return false; end if;
  select * into r from public.motion_revisions where id=(i->>'revision_id')::uuid and workspace_id=w;
  return coalesce(r.id is not null and r.settings=settings and exists(select 1 from storage.objects where bucket_id='creativeotter-motion-sources' and name=r.source_path),false);
 end if;
 return coalesce((select count(*) from jsonb_object_keys(i))=case when i ? 'engine' then 10 else 9 end and coalesce(i->>'engine','css')='css'
 and i->>'format' in ('png','mp4') and char_length(i->>'html') between 1 and 24000 and char_length(i->>'css')<=12000
 and (i->>'duration_seconds')::integer<=10 and (i->>'fps')::integer in (12,24) and jsonb_array_length(i->'asset_ids')<=4,false);
end;
$$;

notify pgrst,'reload schema';

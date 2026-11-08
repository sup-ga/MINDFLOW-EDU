-- Enable RLS-protected live events for the administrative review workspace.
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.professional_profiles,
  public.professional_documents,
  public.tutor_prestation_events;

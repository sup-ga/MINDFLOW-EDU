-- Enable row-level-filtered Realtime events for learner and professional workflows.
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.professional_offers,
  public.professional_classes,
  public.class_requests,
  public.class_enrollments,
  public.class_sessions,
  public.professional_notifications,
  public.professional_messages,
  public.professional_contact_offers,
  public.professional_wallet_transactions,
  public.learner_notifications,
  public.tutor_requests,
  public.tutor_request_messages,
  public.tutor_prestations,
  public.tutor_prestation_sessions;

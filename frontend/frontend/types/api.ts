export type UserRole = 'User' | 'Support' | 'Administrator' | 'Owner';
export type SubscriptionPlan = 'Free' | 'Pro' | 'VIP';

export type UserProfile = {
  id: number;
  email: string;
  name: string | null;
  role: UserRole;
  avatar_url: string | null;
  subscription: SubscriptionPlan;
  freeGens: number;
  is_admin: boolean;
  telegram_linked: boolean;
  telegram_username: string | null;
  telegram_first_name: string | null;
  telegram_notifications_enabled: boolean;
};

export type TelegramPendingLink = {
  code: string;
  expires_at: string;
  deep_link: string | null;
};

export type TelegramLinkStatus = {
  linked: boolean;
  telegram_user_id: string | null;
  telegram_username: string | null;
  telegram_first_name: string | null;
  telegram_linked_at: string | null;
  telegram_notifications_enabled: boolean;
  bot_username: string | null;
  bot_url: string | null;
  pending_link: TelegramPendingLink | null;
};

export type PublicSiteStats = {
  total_users: number;
  total_lessons: number;
  total_reviews: number;
  average_rating: number;
  active_users_7d: number;
};

export type NewsItem = {
  id: number;
  channel_post_id: string;
  channel_username: string;
  title: string | null;
  text: string | null;
  excerpt: string | null;
  telegram_url: string | null;
  image_url: string | null;
  media_type: string | null;
  is_pinned: boolean;
  published_at: string | null;
  edited_at: string | null;
};

export type AdminNewsItem = NewsItem & {
  text: string | null;
  excerpt: string | null;
  image_url: string | null;
  media_file_id: string | null;
  is_visible: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type Review = {
  id: number;
  user: string;
  text: string;
  rating: number;
  avatar_url?: string | null;
};

export type AdminUser = {
  id: number;
  email: string;
  name: string | null;
  role: UserRole;
  avatar_url: string | null;
  subscription: SubscriptionPlan;
  credits: number;
  is_banned: boolean;
  sub_ends: string | null;
  reset_at: string | null;
  created_at: string | null;
};

export type AnalyticsDistributionItem = {
  key: string;
  label: string;
  value: number;
};

export type AnalyticsSeriesPoint = {
  date: string;
  value: number;
};

export type GenerationRunSnapshot = {
  request_id: string;
  topic: string;
  subject: string;
  grade: string;
  status: 'success' | 'failed';
  final_strategy: string | null;
  quality_score: number | null;
  quality_total_items: number | null;
  fell_back_to_rich: boolean;
  used_repair_pass: boolean;
  duration_ms: number | null;
  created_at: string | null;
  source_files_count: number;
  source_names: string[];
  reference_doc: string | null;
  has_reference_structure: boolean;
  template_docs_found: number;
  parsed_docs_count: number;
  source_hints_count: number;
  has_slide_plan: boolean;
  blueprint_sections: number;
  blueprint_stages: number;
  output_name: string | null;
  output_ext: string | null;
  error_message: string | null;
  weak_nodes: string[];
};

export type AdminStats = {
  total_users: number;
  total_lessons: number;
  open_tickets: number;
  total_reviews: number;
  total_credits: number;
  new_users_7d: number;
  lessons_7d: number;
  lessons_today: number;
  average_rating: number;
  active_users_7d: number;
  subscription_breakdown: AnalyticsDistributionItem[];
  role_breakdown: AnalyticsDistributionItem[];
  top_events_7d: AnalyticsDistributionItem[];
  funnel_7d: AnalyticsDistributionItem[];
  signup_series_7d: AnalyticsSeriesPoint[];
  lesson_series_7d: AnalyticsSeriesPoint[];
  generation_success_7d: number;
  generation_failed_7d: number;
  generation_fallback_7d: number;
  generation_repair_7d: number;
  avg_generation_score_7d: number;
  avg_generation_duration_ms_7d: number;
  generation_strategy_breakdown_7d: AnalyticsDistributionItem[];
  generation_status_breakdown_7d: AnalyticsDistributionItem[];
  weak_nodes_7d: AnalyticsDistributionItem[];
  recent_generation_runs: GenerationRunSnapshot[];
};

export type GoogleCredentialResponse = {
  credential?: string;
};

export type GenerationRunMetrics = {
  topic_coverage_ratio: number;
  practice_topic_coverage_ratio: number;
  actualization_topic_coverage_ratio: number;
  generic_phrase_ratio: number;
  specificity_ratio: number;
  structure_ratio: number;
  cue_phrase_ratio: number;
  dialogue_ratio: number;
  explanation_repetition_ratio: number;
  needs_refinement: boolean;
  reasons: string[];
};

export type GenerationRunOutputFiles = {
  output_name: string;
  output_path: string;
  output_size_bytes: number;
  lesson_dump_available: boolean;
  docx_download_available: boolean;
  pdf_preview_available: boolean;
  pdf_preview_reason: string;
};

export type GenerationRunListItem = {
  id: string;
  request_id: string;
  created_at: string;
  topic: string;
  subject: string;
  grade: string;
  status: 'success' | 'failed' | string;
  requirements: string;
  refinement_used: boolean;
  queue_wait_ms: number;
  generation_ms: number;
  metrics: GenerationRunMetrics;
  output_files: GenerationRunOutputFiles;
};

export type GenerationRunsPagination = {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
};

export type GenerationRunsResponse = {
  items: GenerationRunListItem[];
  pagination: GenerationRunsPagination;
};

export type GenerationRunShareResponse = {
  token: string;
  run_id: string;
  share_path: string;
  share_url: string | null;
  expires_at: string;
};

export type SystemStatusErrorItem = {
  request_id: string;
  created_at: string | null;
  message: string;
};

export type QualityReasonCount = {
  reason: string;
  count: number;
};

export type QualityMetricAverages = {
  topic_coverage_ratio: number;
  practice_topic_coverage_ratio: number;
  specificity_ratio: number;
  generic_phrase_ratio: number;
  structure_ratio: number;
  cue_phrase_ratio: number;
  dialogue_ratio: number;
  explanation_repetition_ratio: number;
};

export type QualityDegradationSignal = {
  metric: string;
  recent_avg: number;
  baseline_avg: number;
  delta: number;
  direction: 'up' | 'down';
  severity: 'warning' | 'critical';
};

export type QualityWindowSummary = {
  window_size: number;
  sample_size: number;
  total_runs: number;
  success_runs: number;
  failed_runs: number;
  refinement_used_count: number;
  refinement_used_ratio: number;
  averages: QualityMetricAverages;
  top_quality_reasons: QualityReasonCount[];
  top_refinement_reasons: QualityReasonCount[];
  top_failure_reasons: QualityReasonCount[];
  degradation_signals: QualityDegradationSignal[];
};

export type QualityTrendsResponse = {
  status: string;
  timestamp: string;
  total_available_runs: number;
  windows: QualityWindowSummary[];
};

export type SystemStatusResponse = {
  status: 'ok' | string;
  timestamp: string;
  backend: {
    reachable: boolean;
    uptime_sec: number;
    version: string;
    build: string;
  };
  generator: {
    recent_window: number;
    success_count: number;
    failed_count: number;
    avg_generation_ms: number;
    latest_errors: SystemStatusErrorItem[];
  };
  queue: {
    reachable: boolean;
    pending_jobs: number;
    processing_jobs: number;
    active_request_id: string | null;
  };
  telegram: {
    configured: boolean;
    bot_username_configured: boolean;
    internal_token_configured: boolean;
    internal_api_auth_ok: boolean;
    internal_api_auth_issue: string | null;
    basic_mode: string;
    last_api_base_used: string | null;
    internal_health_last_ok_at: string | null;
    internal_health_last_error_at: string | null;
    internal_health_last_error: string | null;
    last_update_type: string | null;
    last_success_event_at: string | null;
    last_error_at: string | null;
    last_error: string | null;
    news_sync_total: number;
    news_sync_failed_total: number;
    notification_poll_success_total: number;
    notification_poll_failed_total: number;
    notification_delivery_failed_total: number;
    linked_users_count: number;
    pending_notifications: number;
    sent_notifications_24h: number;
    last_sent_at: string | null;
    last_event_at: string | null;
  };
};

export type FeedbackInboxListItem = {
  feedback_id: string;
  created_at: string;
  topic: string;
  problem_type: string;
  user_email: string | null;
  reply_status: string;
  run_id: string;
  comment_preview: string;
};

export type FeedbackInboxListResponse = {
  items: FeedbackInboxListItem[];
  smtp?: {
    configured: boolean;
  };
};

export type FeedbackDetailsItem = {
  feedback_id: string;
  run_id: string;
  topic: string;
  subject: string;
  grade: string;
  problem_type: string;
  comment: string | null;
  user_email: string | null;
  metrics: Record<string, number | string | boolean | null>;
  refinement_used: boolean;
  lesson_path: string;
  reply_sent_at: string | null;
  reply_status: string;
  reply_subject: string;
  reply_body_preview: string;
  replied_by: string;
  created_at: string;
};

export type FeedbackDetailsResponse = {
  item: FeedbackDetailsItem;
};

export type FeedbackReplyResponse = {
  status: string;
  feedback_id: string;
  reply_status: string;
};

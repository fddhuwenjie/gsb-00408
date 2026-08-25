export type UserRole = 'editor' | 'reviewer' | 'admin';

export type ContentType = 'article' | 'video' | 'poster';

export type ContentStatus = 'draft' | 'pending_review' | 'review_approved' | 'review_rejected' | 'scheduled' | 'published' | 'withdrawn';

export type ScheduleStatus = 'pending' | 'approved' | 'rejected' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'withdrawn';

export type ReviewDecision = 'approve' | 'reject';

export type PublishStatus = 'pending' | 'scheduled' | 'publishing' | 'success' | 'failed' | 'withdrawn';

export interface User {
  id: number;
  username: string;
  role: UserRole;
  created_at: string;
}

export type RateLimitStatus = 'normal' | 'limited' | 'blocked';

export type FailureReviewStatus = 'pending' | 'resolved';

export type FailureReviewAction = 'republish' | 'manual_publish';

export type ReviewAuditAction = 'create' | 'override';

export interface Channel {
  id: number;
  name: string;
  type: string;
  status: 'active' | 'inactive';
  config?: string;
}

export interface ChannelHealth {
  id: number;
  channel_id: number;
  success_rate: number;
  last_failure_reason: string | null;
  rate_limit_status: RateLimitStatus;
  responsible_person: string | null;
  updated_at: string;
  channel?: Channel;
}

export interface SensitiveWord {
  id: number;
  word: string;
  category: string;
  version: number;
  is_active: boolean;
  created_at: string;
}

export interface Content {
  id: number;
  creator_id: number;
  type: ContentType;
  title: string;
  content: string;
  thumbnail_url?: string;
  status: ContentStatus;
  scan_version: number;
  created_at: string;
  updated_at: string;
}

export interface Schedule {
  id: number;
  content_id: number;
  channel_id: number;
  schedule_time: string;
  status: ScheduleStatus;
  created_at: string;
  updated_at: string;
  content?: Content;
  channel?: Channel;
}

export interface ScanRecord {
  id: number;
  content_id: number;
  word_id: number;
  version: number;
  matched_text: string;
  position: number;
  created_at: string;
  word?: SensitiveWord;
}

export interface ReviewRecord {
  id: number;
  content_id: number;
  reviewer_id: number;
  decision: ReviewDecision;
  opinion: string;
  opinion_version: number;
  created_at: string;
  reviewer?: User;
}

export interface ReviewAuditTrail {
  id: number;
  review_record_id: number;
  operator_id: number;
  action: ReviewAuditAction;
  previous_decision: ReviewDecision | null;
  new_decision: ReviewDecision;
  opinion: string;
  opinion_version: number;
  created_at: string;
  operator?: User;
}

export interface FailureReview {
  id: number;
  publish_record_id: number;
  schedule_id: number;
  handler_id: number | null;
  conclusion: string | null;
  action_type: FailureReviewAction | null;
  status: FailureReviewStatus;
  created_at: string;
  resolved_at: string | null;
  handler?: User;
  publish_record?: PublishRecord;
}

export interface ScheduleRiskWarning {
  channel_id: number;
  channel_name: string;
  risk_level: 'low' | 'medium' | 'high';
  reasons: string[];
}

export interface PublishRecord {
  id: number;
  schedule_id: number;
  status: PublishStatus;
  result?: string;
  withdraw_reason?: string;
  publish_time?: string;
  created_at: string;
  schedule?: Schedule;
}

export interface ExportRecord {
  id: number;
  operator_id: number;
  file_path: string;
  created_at: string;
  operator?: User;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  token: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface PaginationResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateContentRequest {
  type: ContentType;
  title: string;
  content: string;
  thumbnail_url?: string;
}

export interface SubmitScheduleRequest {
  channel_id: number;
  schedule_time: string;
}

export interface UpdateScheduleRequest {
  channel_id?: number;
  schedule_time?: string;
}

export interface ReviewRequest {
  opinion: string;
}

export interface DashboardStats {
  pending_review_count: number;
  today_schedule_count: number;
  sensitive_hit_count: number;
  publish_success_rate: number;
  high_risk_channel_count: number;
  pending_failure_review_count: number;
}

export interface ScheduleWithRiskWarning {
  schedule: Schedule;
  risk_warnings: ScheduleRiskWarning[];
}

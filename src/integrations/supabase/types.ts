export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      analysis_jobs: {
        Row: {
          attempt_count: number
          conversation_id: string
          created_at: string
          error_text: string | null
          finished_at: string | null
          id: string
          locked_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["analysis_status"]
        }
        Insert: {
          attempt_count?: number
          conversation_id: string
          created_at?: string
          error_text?: string | null
          finished_at?: string | null
          id?: string
          locked_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["analysis_status"]
        }
        Update: {
          attempt_count?: number
          conversation_id?: string
          created_at?: string
          error_text?: string | null
          finished_at?: string | null
          id?: string
          locked_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["analysis_status"]
        }
        Relationships: []
      }
      app_secrets: {
        Row: {
          cron_secret: string | null
          id: boolean
          openai_api_key: string | null
          updated_at: string
        }
        Insert: {
          cron_secret?: string | null
          id?: boolean
          openai_api_key?: string | null
          updated_at?: string
        }
        Update: {
          cron_secret?: string | null
          id?: boolean
          openai_api_key?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          business_hours: Json
          coach_alert_threshold: number
          company_name: string | null
          current_dna_snapshot_id: string | null
          current_playbook_snapshot_id: string | null
          demo_seeded: boolean
          dna_individual_mode: boolean
          dna_min_lost: number
          dna_min_sellers: number
          dna_min_won: number
          dna_quality_max_bad: number
          dna_quality_min_good: number
          dna_use_quality_score: boolean
          enable_llm_anonymization: boolean
          has_openai_byok: boolean
          id: boolean
          last_dna_snapshot_at: string | null
          llm_cost_cap_usd_day: number
          logo_url: string | null
          published_prompt_version_id: string | null
          tagged_since_snapshot: number
          updated_at: string
        }
        Insert: {
          business_hours?: Json
          coach_alert_threshold?: number
          company_name?: string | null
          current_dna_snapshot_id?: string | null
          current_playbook_snapshot_id?: string | null
          demo_seeded?: boolean
          dna_individual_mode?: boolean
          dna_min_lost?: number
          dna_min_sellers?: number
          dna_min_won?: number
          dna_quality_max_bad?: number
          dna_quality_min_good?: number
          dna_use_quality_score?: boolean
          enable_llm_anonymization?: boolean
          has_openai_byok?: boolean
          id?: boolean
          last_dna_snapshot_at?: string | null
          llm_cost_cap_usd_day?: number
          logo_url?: string | null
          published_prompt_version_id?: string | null
          tagged_since_snapshot?: number
          updated_at?: string
        }
        Update: {
          business_hours?: Json
          coach_alert_threshold?: number
          company_name?: string | null
          current_dna_snapshot_id?: string | null
          current_playbook_snapshot_id?: string | null
          demo_seeded?: boolean
          dna_individual_mode?: boolean
          dna_min_lost?: number
          dna_min_sellers?: number
          dna_min_won?: number
          dna_quality_max_bad?: number
          dna_quality_min_good?: number
          dna_use_quality_score?: boolean
          enable_llm_anonymization?: boolean
          has_openai_byok?: boolean
          id?: boolean
          last_dna_snapshot_at?: string | null
          llm_cost_cap_usd_day?: number
          logo_url?: string | null
          published_prompt_version_id?: string | null
          tagged_since_snapshot?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_current_playbook_snapshot_id_fkey"
            columns: ["current_playbook_snapshot_id"]
            isOneToOne: false
            referencedRelation: "playbook_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_settings_published_prompt_version_id_fkey"
            columns: ["published_prompt_version_id"]
            isOneToOne: false
            referencedRelation: "prompt_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_evaluations: {
        Row: {
          adherence_breakdown: Json | null
          conversation_id: string
          created_at: string
          dna_snapshot_id: string | null
          id: string
          message_id: string
          score: number
          suggestion: string | null
        }
        Insert: {
          adherence_breakdown?: Json | null
          conversation_id: string
          created_at?: string
          dna_snapshot_id?: string | null
          id?: string
          message_id: string
          score: number
          suggestion?: string | null
        }
        Update: {
          adherence_breakdown?: Json | null
          conversation_id?: string
          created_at?: string
          dna_snapshot_id?: string | null
          id?: string
          message_id?: string
          score?: number
          suggestion?: string | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          analysis_status: string
          audio_pct: number | null
          auto_marked: boolean
          avg_response_minutes: number | null
          created_at: string
          external_chat_id: string | null
          first_msg_at: string | null
          first_response_minutes: number | null
          id: string
          ignored_reason: string | null
          last_msg_at: string | null
          lead_name_anon: string | null
          lead_phone: string
          message_count: number
          outcome: string
          outcome_at: string | null
          outcome_auto_tagged: boolean
          outcome_by: string | null
          outcome_source: string
          outcome_value: number | null
          pipedrive_deal_id: string | null
          quality_breakdown: Json | null
          quality_evaluated_at: string | null
          quality_model: string | null
          quality_provider: string | null
          quality_score: number | null
          seller_id: string | null
          source: string
          updated_at: string
          vocabulary: Json | null
        }
        Insert: {
          analysis_status?: string
          audio_pct?: number | null
          auto_marked?: boolean
          avg_response_minutes?: number | null
          created_at?: string
          external_chat_id?: string | null
          first_msg_at?: string | null
          first_response_minutes?: number | null
          id?: string
          ignored_reason?: string | null
          last_msg_at?: string | null
          lead_name_anon?: string | null
          lead_phone: string
          message_count?: number
          outcome?: string
          outcome_at?: string | null
          outcome_auto_tagged?: boolean
          outcome_by?: string | null
          outcome_source?: string
          outcome_value?: number | null
          pipedrive_deal_id?: string | null
          quality_breakdown?: Json | null
          quality_evaluated_at?: string | null
          quality_model?: string | null
          quality_provider?: string | null
          quality_score?: number | null
          seller_id?: string | null
          source: string
          updated_at?: string
          vocabulary?: Json | null
        }
        Update: {
          analysis_status?: string
          audio_pct?: number | null
          auto_marked?: boolean
          avg_response_minutes?: number | null
          created_at?: string
          external_chat_id?: string | null
          first_msg_at?: string | null
          first_response_minutes?: number | null
          id?: string
          ignored_reason?: string | null
          last_msg_at?: string | null
          lead_name_anon?: string | null
          lead_phone?: string
          message_count?: number
          outcome?: string
          outcome_at?: string | null
          outcome_auto_tagged?: boolean
          outcome_by?: string | null
          outcome_source?: string
          outcome_value?: number | null
          pipedrive_deal_id?: string | null
          quality_breakdown?: Json | null
          quality_evaluated_at?: string | null
          quality_model?: string | null
          quality_provider?: string | null
          quality_score?: number | null
          seller_id?: string | null
          source?: string
          updated_at?: string
          vocabulary?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      dna_antipatterns: {
        Row: {
          created_at: string
          id: string
          lift: number
          lost_frequency: number
          ngram: string
          sample_size: number
          snapshot_id: string
          won_frequency: number
        }
        Insert: {
          created_at?: string
          id?: string
          lift?: number
          lost_frequency?: number
          ngram: string
          sample_size?: number
          snapshot_id: string
          won_frequency?: number
        }
        Update: {
          created_at?: string
          id?: string
          lift?: number
          lost_frequency?: number
          ngram?: string
          sample_size?: number
          snapshot_id?: string
          won_frequency?: number
        }
        Relationships: [
          {
            foreignKeyName: "dna_antipatterns_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "dna_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      dna_objections: {
        Row: {
          category: string
          created_at: string
          id: string
          occurrences: number
          sample_size: number
          seller_response: string
          snapshot_id: string
          win_rate: number | null
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          occurrences?: number
          sample_size?: number
          seller_response: string
          snapshot_id: string
          win_rate?: number | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          occurrences?: number
          sample_size?: number
          seller_response?: string
          snapshot_id?: string
          win_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dna_objections_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "dna_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      dna_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          top_performer_seller_id: string | null
          total_conversations_analyzed: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          top_performer_seller_id?: string | null
          total_conversations_analyzed?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          top_performer_seller_id?: string | null
          total_conversations_analyzed?: number
        }
        Relationships: []
      }
      export_jobs: {
        Row: {
          created_at: string
          created_by: string | null
          dna_snapshot_id: string
          error_text: string | null
          file_url: string | null
          finished_at: string | null
          id: string
          parameters: Json
          status: Database["public"]["Enums"]["export_status"]
          type: Database["public"]["Enums"]["export_type"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dna_snapshot_id: string
          error_text?: string | null
          file_url?: string | null
          finished_at?: string | null
          id?: string
          parameters?: Json
          status?: Database["public"]["Enums"]["export_status"]
          type: Database["public"]["Enums"]["export_type"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dna_snapshot_id?: string
          error_text?: string | null
          file_url?: string | null
          finished_at?: string | null
          id?: string
          parameters?: Json
          status?: Database["public"]["Enums"]["export_status"]
          type?: Database["public"]["Enums"]["export_type"]
        }
        Relationships: [
          {
            foreignKeyName: "export_jobs_dna_snapshot_id_fkey"
            columns: ["dna_snapshot_id"]
            isOneToOne: false
            referencedRelation: "dna_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          email: string
          expires_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by: string
          email: string
          expires_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          email?: string
          expires_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
        }
        Relationships: []
      }
      llm_usage: {
        Row: {
          cost_usd: number
          id: string
          model: string
          provider: string
          source: string
          tokens_in: number
          tokens_out: number
          ts: string
        }
        Insert: {
          cost_usd?: number
          id?: string
          model: string
          provider: string
          source?: string
          tokens_in?: number
          tokens_out?: number
          ts?: string
        }
        Update: {
          cost_usd?: number
          id?: string
          model?: string
          provider?: string
          source?: string
          tokens_in?: number
          tokens_out?: number
          ts?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          audio_transcript: string | null
          audio_url: string | null
          conversation_id: string
          created_at: string
          external_msg_id: string | null
          id: string
          media_type: string
          raw: Json | null
          sender_role: string
          stage: Database["public"]["Enums"]["message_stage"] | null
          stage_confidence: number | null
          stage_manual: boolean
          text: string | null
          ts: string
        }
        Insert: {
          audio_transcript?: string | null
          audio_url?: string | null
          conversation_id: string
          created_at?: string
          external_msg_id?: string | null
          id?: string
          media_type?: string
          raw?: Json | null
          sender_role: string
          stage?: Database["public"]["Enums"]["message_stage"] | null
          stage_confidence?: number | null
          stage_manual?: boolean
          text?: string | null
          ts: string
        }
        Update: {
          audio_transcript?: string | null
          audio_url?: string | null
          conversation_id?: string
          created_at?: string
          external_msg_id?: string | null
          id?: string
          media_type?: string
          raw?: Json | null
          sender_role?: string
          stage?: Database["public"]["Enums"]["message_stage"] | null
          stage_confidence?: number | null
          stage_manual?: boolean
          text?: string | null
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          audience: string
          body: string | null
          created_at: string
          id: string
          payload: Json | null
          read_at: string | null
          title: string
          type: string
        }
        Insert: {
          audience?: string
          body?: string | null
          created_at?: string
          id?: string
          payload?: Json | null
          read_at?: string | null
          title: string
          type: string
        }
        Update: {
          audience?: string
          body?: string | null
          created_at?: string
          id?: string
          payload?: Json | null
          read_at?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      objections: {
        Row: {
          category: string
          conversation_id: string
          created_at: string
          id: string
          lead_excerpt: string | null
          lead_msg_id: string | null
          seller_msg_id: string | null
          seller_response: string | null
        }
        Insert: {
          category: string
          conversation_id: string
          created_at?: string
          id?: string
          lead_excerpt?: string | null
          lead_msg_id?: string | null
          seller_msg_id?: string | null
          seller_response?: string | null
        }
        Update: {
          category?: string
          conversation_id?: string
          created_at?: string
          id?: string
          lead_excerpt?: string | null
          lead_msg_id?: string | null
          seller_msg_id?: string | null
          seller_response?: string | null
        }
        Relationships: []
      }
      pipedrive_connections: {
        Row: {
          api_domain: string | null
          company_id: string | null
          connected_by: string | null
          created_at: string
          id: string
          oauth_access_token: string | null
          oauth_refresh_token: string | null
          scopes: string[] | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          api_domain?: string | null
          company_id?: string | null
          connected_by?: string | null
          created_at?: string
          id?: string
          oauth_access_token?: string | null
          oauth_refresh_token?: string | null
          scopes?: string[] | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          api_domain?: string | null
          company_id?: string | null
          connected_by?: string | null
          created_at?: string
          id?: string
          oauth_access_token?: string | null
          oauth_refresh_token?: string | null
          scopes?: string[] | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      playbook_snapshots: {
        Row: {
          bad_samples: number
          conversations_analyzed: number
          cost_usd: number
          generated_at: string
          generated_by: string | null
          good_samples: number
          id: string
          losing_scripts: Json
          model: string
          provider: string
          summary: string | null
          system_prompt: string
          training_tips: Json
          vocabulary: Json
          voice_tone: Json
          winning_scripts: Json
        }
        Insert: {
          bad_samples?: number
          conversations_analyzed?: number
          cost_usd?: number
          generated_at?: string
          generated_by?: string | null
          good_samples?: number
          id?: string
          losing_scripts?: Json
          model: string
          provider: string
          summary?: string | null
          system_prompt: string
          training_tips?: Json
          vocabulary?: Json
          voice_tone?: Json
          winning_scripts?: Json
        }
        Update: {
          bad_samples?: number
          conversations_analyzed?: number
          cost_usd?: number
          generated_at?: string
          generated_by?: string | null
          good_samples?: number
          id?: string
          losing_scripts?: Json
          model?: string
          provider?: string
          summary?: string | null
          system_prompt?: string
          training_tips?: Json
          vocabulary?: Json
          voice_tone?: Json
          winning_scripts?: Json
        }
        Relationships: []
      }
      playbooks: {
        Row: {
          created_at: string
          created_by: string | null
          dna_snapshot_id: string
          file_url: string | null
          format: string
          id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dna_snapshot_id: string
          file_url?: string | null
          format: string
          id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dna_snapshot_id?: string
          file_url?: string | null
          format?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playbooks_dna_snapshot_id_fkey"
            columns: ["dna_snapshot_id"]
            isOneToOne: false
            referencedRelation: "dna_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      prompt_versions: {
        Row: {
          created_at: string
          created_by: string | null
          dna_snapshot_id: string
          id: string
          is_published: boolean
          name: string
          parameters: Json
          system_prompt: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dna_snapshot_id: string
          id?: string
          is_published?: boolean
          name: string
          parameters?: Json
          system_prompt: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dna_snapshot_id?: string
          id?: string
          is_published?: boolean
          name?: string
          parameters?: Json
          system_prompt?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompt_versions_dna_snapshot_id_fkey"
            columns: ["dna_snapshot_id"]
            isOneToOne: false
            referencedRelation: "dna_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      quality_score_jobs: {
        Row: {
          attempt_count: number
          conversation_id: string
          created_at: string
          error_text: string | null
          finished_at: string | null
          id: string
          locked_at: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          attempt_count?: number
          conversation_id: string
          created_at?: string
          error_text?: string | null
          finished_at?: string | null
          id?: string
          locked_at?: string | null
          started_at?: string | null
          status?: string
        }
        Update: {
          attempt_count?: number
          conversation_id?: string
          created_at?: string
          error_text?: string | null
          finished_at?: string | null
          id?: string
          locked_at?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: []
      }
      seller_dna_scores: {
        Row: {
          avg_first_response_minutes: number | null
          created_at: string
          id: string
          is_top_performer: boolean
          lead_response_rate: number | null
          score: number
          seller_id: string
          snapshot_id: string
          stage_distribution: Json | null
          total_conversations: number
          win_rate: number | null
        }
        Insert: {
          avg_first_response_minutes?: number | null
          created_at?: string
          id?: string
          is_top_performer?: boolean
          lead_response_rate?: number | null
          score?: number
          seller_id: string
          snapshot_id: string
          stage_distribution?: Json | null
          total_conversations?: number
          win_rate?: number | null
        }
        Update: {
          avg_first_response_minutes?: number | null
          created_at?: string
          id?: string
          is_top_performer?: boolean
          lead_response_rate?: number | null
          score?: number
          seller_id?: string
          snapshot_id?: string
          stage_distribution?: Json | null
          total_conversations?: number
          win_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "seller_dna_scores_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "dna_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      sellers: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      sync_jobs: {
        Row: {
          attempt_count: number
          audios_queued: number
          chats_found: number
          chats_imported: number
          created_at: string
          created_by: string | null
          error_text: string | null
          errors: Json
          finished_at: string | null
          id: string
          instance_id: string
          locked_at: string | null
          messages_imported: number
          params: Json
          started_at: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          audios_queued?: number
          chats_found?: number
          chats_imported?: number
          created_at?: string
          created_by?: string | null
          error_text?: string | null
          errors?: Json
          finished_at?: string | null
          id?: string
          instance_id: string
          locked_at?: string | null
          messages_imported?: number
          params?: Json
          started_at?: string | null
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          audios_queued?: number
          chats_found?: number
          chats_imported?: number
          created_at?: string
          created_by?: string | null
          error_text?: string | null
          errors?: Json
          finished_at?: string | null
          id?: string
          instance_id?: string
          locked_at?: string | null
          messages_imported?: number
          params?: Json
          started_at?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      transcribe_jobs: {
        Row: {
          attempt_count: number
          created_at: string
          error_text: string | null
          finished_at: string | null
          id: string
          locked_at: string | null
          message_id: string
          started_at: string | null
          status: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          error_text?: string | null
          finished_at?: string | null
          id?: string
          locked_at?: string | null
          message_id: string
          started_at?: string | null
          status?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          error_text?: string | null
          finished_at?: string | null
          id?: string
          locked_at?: string | null
          message_id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcribe_jobs_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_instances: {
        Row: {
          created_at: string
          evolution_url: string
          id: string
          instance_name: string
          last_error: string | null
          last_sync_at: string | null
          qr_code_url: string | null
          seller_id: string | null
          status: string
          updated_at: string
          webhook_token: string
        }
        Insert: {
          created_at?: string
          evolution_url: string
          id?: string
          instance_name: string
          last_error?: string | null
          last_sync_at?: string | null
          qr_code_url?: string | null
          seller_id?: string | null
          status?: string
          updated_at?: string
          webhook_token?: string
        }
        Update: {
          created_at?: string
          evolution_url?: string
          id?: string
          instance_name?: string
          last_error?: string | null
          last_sync_at?: string | null
          qr_code_url?: string | null
          seller_id?: string | null
          status?: string
          updated_at?: string
          webhook_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_secrets: {
        Row: {
          created_at: string
          evolution_token: string
          instance_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          evolution_token: string
          instance_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          evolution_token?: string
          instance_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_secrets_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: { Args: { _token: string }; Returns: undefined }
      claim_pending_jobs: {
        Args: { _batch_size: number; _table: string }
        Returns: string[]
      }
      count_admins: { Args: never; Returns: number }
      has_any_user: { Args: never; Returns: boolean }
      is_admin: { Args: { _uid: string }; Returns: boolean }
      is_seller_phone: { Args: { _phone: string }; Returns: boolean }
    }
    Enums: {
      analysis_status: "pending" | "running" | "done" | "failed"
      app_role: "admin" | "member"
      export_status: "pending" | "running" | "done" | "failed"
      export_type:
        | "system_prompt"
        | "playbook"
        | "fewshot"
        | "rag"
        | "finetune_openai"
        | "finetune_gemini"
      message_stage:
        | "abertura"
        | "qualificacao"
        | "valor"
        | "objecao"
        | "fechamento"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      analysis_status: ["pending", "running", "done", "failed"],
      app_role: ["admin", "member"],
      export_status: ["pending", "running", "done", "failed"],
      export_type: [
        "system_prompt",
        "playbook",
        "fewshot",
        "rag",
        "finetune_openai",
        "finetune_gemini",
      ],
      message_stage: [
        "abertura",
        "qualificacao",
        "valor",
        "objecao",
        "fechamento",
      ],
    },
  },
} as const

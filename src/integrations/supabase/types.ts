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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_connections: {
        Row: {
          connected_at: string
          created_at: string
          data_types: string[]
          id: string
          last_sync_at: string | null
          last_sync_status: string | null
          method: string
          paused_at: string | null
          provider_id: string
          records_imported: number
          revoked_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connected_at?: string
          created_at?: string
          data_types?: string[]
          id?: string
          last_sync_at?: string | null
          last_sync_status?: string | null
          method: string
          paused_at?: string | null
          provider_id: string
          records_imported?: number
          revoked_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connected_at?: string
          created_at?: string
          data_types?: string[]
          id?: string
          last_sync_at?: string | null
          last_sync_status?: string | null
          method?: string
          paused_at?: string | null
          provider_id?: string
          records_imported?: number
          revoked_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          category: string
          created_at: string
          id: string
          limit_paise: number
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          limit_paise: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          limit_paise?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      category_rules: {
        Row: {
          category: string
          created_at: string
          id: string
          match_field: string
          pattern: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          match_field?: string
          pattern: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          match_field?: string
          pattern?: string
          user_id?: string
        }
        Relationships: []
      }
      connection_audit_events: {
        Row: {
          connection_id: string | null
          created_at: string
          detail: Json
          event: string
          id: string
          provider_id: string
          user_id: string
        }
        Insert: {
          connection_id?: string | null
          created_at?: string
          detail?: Json
          event: string
          id?: string
          provider_id: string
          user_id: string
        }
        Update: {
          connection_id?: string | null
          created_at?: string
          detail?: Json
          event?: string
          id?: string
          provider_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connection_audit_events_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "app_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_consents: {
        Row: {
          connection_id: string
          consent_version: string
          expires_at: string | null
          granted_at: string
          id: string
          provider_id: string
          purpose: string
          revoked_at: string | null
          scope: string[]
          user_id: string
        }
        Insert: {
          connection_id: string
          consent_version: string
          expires_at?: string | null
          granted_at?: string
          id?: string
          provider_id: string
          purpose: string
          revoked_at?: string | null
          scope?: string[]
          user_id: string
        }
        Update: {
          connection_id?: string
          consent_version?: string
          expires_at?: string | null
          granted_at?: string
          id?: string
          provider_id?: string
          purpose?: string
          revoked_at?: string | null
          scope?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connection_consents_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "app_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      data_consents: {
        Row: {
          granted_at: string
          id: string
          provider: string
          purpose: string
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          granted_at?: string
          id?: string
          provider: string
          purpose: string
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          granted_at?: string
          id?: string
          provider?: string
          purpose?: string
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      document_extractions: {
        Row: {
          batch_id: string | null
          classification_confidence: string | null
          confidence_metadata: Json | null
          created_at: string
          document_type: string | null
          error_code: string | null
          extracted_payload: Json | null
          file_name: string | null
          file_path: string | null
          id: string
          image_deleted_at: string | null
          interpretation: Json | null
          keep_image: boolean
          mime_type: string | null
          ocr_model: string | null
          ocr_provider: string | null
          processing_status: string
          reviewed_payload: Json | null
          transaction_id: string | null
          updated_at: string
          user_document_type: string | null
          user_id: string
          validation_results: Json | null
        }
        Insert: {
          batch_id?: string | null
          classification_confidence?: string | null
          confidence_metadata?: Json | null
          created_at?: string
          document_type?: string | null
          error_code?: string | null
          extracted_payload?: Json | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          image_deleted_at?: string | null
          interpretation?: Json | null
          keep_image?: boolean
          mime_type?: string | null
          ocr_model?: string | null
          ocr_provider?: string | null
          processing_status?: string
          reviewed_payload?: Json | null
          transaction_id?: string | null
          updated_at?: string
          user_document_type?: string | null
          user_id: string
          validation_results?: Json | null
        }
        Update: {
          batch_id?: string | null
          classification_confidence?: string | null
          confidence_metadata?: Json | null
          created_at?: string
          document_type?: string | null
          error_code?: string | null
          extracted_payload?: Json | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          image_deleted_at?: string | null
          interpretation?: Json | null
          keep_image?: boolean
          mime_type?: string | null
          ocr_model?: string | null
          ocr_provider?: string | null
          processing_status?: string
          reviewed_payload?: Json | null
          transaction_id?: string | null
          updated_at?: string
          user_document_type?: string | null
          user_id?: string
          validation_results?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "document_extractions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_sources: {
        Row: {
          acquisition_method: string
          created_at: string
          currency: string
          id: string
          is_demo: boolean
          masked_label: string | null
          name: string
          opening_balance_paise: number
          source_type: string
          user_id: string
        }
        Insert: {
          acquisition_method?: string
          created_at?: string
          currency?: string
          id?: string
          is_demo?: boolean
          masked_label?: string | null
          name: string
          opening_balance_paise?: number
          source_type: string
          user_id: string
        }
        Update: {
          acquisition_method?: string
          created_at?: string
          currency?: string
          id?: string
          is_demo?: boolean
          masked_label?: string | null
          name?: string
          opening_balance_paise?: number
          source_type?: string
          user_id?: string
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          created_at: string
          duplicate_count: number
          file_name: string
          id: string
          imported_count: number
          invalid_count: number
          skipped_count: number
          source_id: string | null
          statement_kind: string
          status: string
          total_rows: number
          user_id: string
        }
        Insert: {
          created_at?: string
          duplicate_count?: number
          file_name: string
          id?: string
          imported_count?: number
          invalid_count?: number
          skipped_count?: number
          source_id?: string | null
          statement_kind?: string
          status?: string
          total_rows?: number
          user_id: string
        }
        Update: {
          created_at?: string
          duplicate_count?: number
          file_name?: string
          id?: string
          imported_count?: number
          invalid_count?: number
          skipped_count?: number
          source_id?: string | null
          statement_kind?: string
          status?: string
          total_rows?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "financial_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          country: string
          created_at: string
          currency: string
          display_name: string
          id: string
          locale: string
          time_format: string
          updated_at: string
        }
        Insert: {
          country?: string
          created_at?: string
          currency?: string
          display_name?: string
          id: string
          locale?: string
          time_format?: string
          updated_at?: string
        }
        Update: {
          country?: string
          created_at?: string
          currency?: string
          display_name?: string
          id?: string
          locale?: string
          time_format?: string
          updated_at?: string
        }
        Relationships: []
      }
      receipt_items: {
        Row: {
          category: string | null
          confidence: string | null
          created_at: string
          extraction_id: string
          id: string
          line_total_paise: number | null
          normalised_name: string | null
          original_name: string
          position: number
          quantity: number | null
          review_status: string
          transaction_id: string | null
          unit_price_paise: number | null
          user_id: string
        }
        Insert: {
          category?: string | null
          confidence?: string | null
          created_at?: string
          extraction_id: string
          id?: string
          line_total_paise?: number | null
          normalised_name?: string | null
          original_name: string
          position?: number
          quantity?: number | null
          review_status?: string
          transaction_id?: string | null
          unit_price_paise?: number | null
          user_id: string
        }
        Update: {
          category?: string | null
          confidence?: string | null
          created_at?: string
          extraction_id?: string
          id?: string
          line_total_paise?: number | null
          normalised_name?: string | null
          original_name?: string
          position?: number
          quantity?: number | null
          review_status?: string
          transaction_id?: string | null
          unit_price_paise?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_items_extraction_id_fkey"
            columns: ["extraction_id"]
            isOneToOne: false
            referencedRelation: "document_extractions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_contributions: {
        Row: {
          amount_paise: number
          contributed_on: string
          created_at: string
          goal_id: string
          id: string
          kind: string
          note: string | null
          user_id: string
        }
        Insert: {
          amount_paise: number
          contributed_on: string
          created_at?: string
          goal_id: string
          id?: string
          kind?: string
          note?: string | null
          user_id?: string
        }
        Update: {
          amount_paise?: number
          contributed_on?: string
          created_at?: string
          goal_id?: string
          id?: string
          kind?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_contributions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "savings_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_goals: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          target_date: string | null
          target_paise: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          target_date?: string | null
          target_paise: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          target_date?: string | null
          target_paise?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      source_records: {
        Row: {
          amount_paise: number | null
          connection_id: string
          created_at: string
          description: string | null
          direction: string
          id: string
          interpretation: string | null
          items: Json
          link_role: string | null
          match_score: number | null
          merchant: string | null
          merchant_raw: string | null
          occurred_at: string | null
          order_id: string | null
          payment_method: string | null
          provider_id: string
          provider_record_id: string
          record_type: string
          reference: string | null
          status: string
          sync_batch_id: string | null
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          amount_paise?: number | null
          connection_id: string
          created_at?: string
          description?: string | null
          direction?: string
          id?: string
          interpretation?: string | null
          items?: Json
          link_role?: string | null
          match_score?: number | null
          merchant?: string | null
          merchant_raw?: string | null
          occurred_at?: string | null
          order_id?: string | null
          payment_method?: string | null
          provider_id: string
          provider_record_id: string
          record_type: string
          reference?: string | null
          status: string
          sync_batch_id?: string | null
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          amount_paise?: number | null
          connection_id?: string
          created_at?: string
          description?: string | null
          direction?: string
          id?: string
          interpretation?: string | null
          items?: Json
          link_role?: string | null
          match_score?: number | null
          merchant?: string | null
          merchant_raw?: string | null
          occurred_at?: string | null
          order_id?: string | null
          payment_method?: string | null
          provider_id?: string
          provider_record_id?: string
          record_type?: string
          reference?: string | null
          status?: string
          sync_batch_id?: string | null
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_records_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "app_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_records_sync_batch_id_fkey"
            columns: ["sync_batch_id"]
            isOneToOne: false
            referencedRelation: "sync_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_records_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_batches: {
        Row: {
          accepted_count: number
          completed_at: string | null
          connection_id: string
          duplicate_count: number
          error_count: number
          file_hash: string | null
          file_name: string | null
          id: string
          linked_count: number
          not_counted_count: number
          received_count: number
          rejected_count: number
          review_count: number
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          accepted_count?: number
          completed_at?: string | null
          connection_id: string
          duplicate_count?: number
          error_count?: number
          file_hash?: string | null
          file_name?: string | null
          id: string
          linked_count?: number
          not_counted_count?: number
          received_count?: number
          rejected_count?: number
          review_count?: number
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          accepted_count?: number
          completed_at?: string | null
          connection_id?: string
          duplicate_count?: number
          error_count?: number
          file_hash?: string | null
          file_name?: string | null
          id?: string
          linked_count?: number
          not_counted_count?: number
          received_count?: number
          rejected_count?: number
          review_count?: number
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_batches_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "app_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount_paise: number
          category: string | null
          confirmation_status: string
          created_at: string
          currency: string
          description: string
          entry_method: string
          extraction_id: string | null
          id: string
          import_batch_id: string | null
          is_demo: boolean
          merchant: string | null
          notes: string | null
          occurred_at: string
          payment_method: string | null
          provider_id: string | null
          reference: string | null
          source_id: string | null
          to_source_id: string | null
          txn_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_paise: number
          category?: string | null
          confirmation_status?: string
          created_at?: string
          currency?: string
          description: string
          entry_method?: string
          extraction_id?: string | null
          id?: string
          import_batch_id?: string | null
          is_demo?: boolean
          merchant?: string | null
          notes?: string | null
          occurred_at: string
          payment_method?: string | null
          provider_id?: string | null
          reference?: string | null
          source_id?: string | null
          to_source_id?: string | null
          txn_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_paise?: number
          category?: string | null
          confirmation_status?: string
          created_at?: string
          currency?: string
          description?: string
          entry_method?: string
          extraction_id?: string | null
          id?: string
          import_batch_id?: string | null
          is_demo?: boolean
          merchant?: string | null
          notes?: string | null
          occurred_at?: string
          payment_method?: string | null
          provider_id?: string | null
          reference?: string | null
          source_id?: string | null
          to_source_id?: string | null
          txn_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_extraction_id_fkey"
            columns: ["extraction_id"]
            isOneToOne: false
            referencedRelation: "document_extractions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "financial_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_to_source_id_fkey"
            columns: ["to_source_id"]
            isOneToOne: false
            referencedRelation: "financial_sources"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      connect_app: {
        Args: {
          p_consent_version: string
          p_data_types: string[]
          p_method: string
          p_provider_id: string
          p_purpose: string
        }
        Returns: string
      }
      delete_connection_data: {
        Args: { p_connection_id: string }
        Returns: Json
      }
      import_statement: {
        Args: {
          p_batch_id: string
          p_duplicate_count: number
          p_file_name: string
          p_invalid_count: number
          p_rows: Json
          p_source_id: string
          p_statement_kind: string
          p_total_rows: number
        }
        Returns: string
      }
      ingest_source_records: {
        Args: {
          p_batch_id: string
          p_connection_id: string
          p_counts: Json
          p_file_hash: string
          p_file_name: string
          p_groups: Json
        }
        Returns: Json
      }
      save_extraction: {
        Args: {
          p_allow_duplicate: boolean
          p_extraction_id: string
          p_items: Json
          p_keep_image: boolean
          p_reviewed: Json
          p_txn: Json
          p_validation: Json
        }
        Returns: string
      }
      set_connection_status: {
        Args: { p_action: string; p_connection_id: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

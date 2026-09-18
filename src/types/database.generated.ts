export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      daily_targets: {
        Row: {
          activity_factor: number
          app_id: string
          bmi: number
          bmr: number
          calculation_assumptions: string
          calculation_version: string
          calories: number
          carbs_g: number
          created_at: string
          disclaimer: string
          effective_date: string
          fat_g: number
          formula: string
          goal_adjustment: number
          goal_row_id: number
          protein_g: number
          raw_calories: number
          row_id: number
          safety_outcome: string
          tdee: number
          user_id: string
          version: number
        }
        Insert: {
          activity_factor: number
          app_id: string
          bmi: number
          bmr: number
          calculation_assumptions?: string
          calculation_version?: string
          calories: number
          carbs_g: number
          created_at?: string
          disclaimer: string
          effective_date: string
          fat_g: number
          formula: string
          goal_adjustment?: number
          goal_row_id: number
          protein_g: number
          raw_calories?: number
          row_id?: never
          safety_outcome?: string
          tdee: number
          user_id: string
          version: number
        }
        Update: {
          activity_factor?: number
          app_id?: string
          bmi?: number
          bmr?: number
          calculation_assumptions?: string
          calculation_version?: string
          calories?: number
          carbs_g?: number
          created_at?: string
          disclaimer?: string
          effective_date?: string
          fat_g?: number
          formula?: string
          goal_adjustment?: number
          goal_row_id?: number
          protein_g?: number
          raw_calories?: number
          row_id?: never
          safety_outcome?: string
          tdee?: number
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_targets_goal_fk"
            columns: ["goal_row_id", "user_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["row_id", "user_id"]
          },
        ]
      }
      exercise_logs: {
        Row: {
          actual_exercise_row_id: number
          actual_hold_seconds: number | null
          actual_load: number | null
          actual_load_unit: string | null
          actual_measure: string
          actual_reps: number | null
          actual_sets: number | null
          created_at: string
          manageable: boolean | null
          note: string | null
          pain: boolean | null
          planned_exercise_app_id: string
          planned_exercise_name_snapshot: string
          planned_exercise_row_id: number
          planned_hold_seconds: number | null
          planned_measure: string
          planned_reps: number | null
          planned_sets: number
          row_id: number
          rpe: number | null
          session_row_id: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_exercise_row_id: number
          actual_hold_seconds?: number | null
          actual_load?: number | null
          actual_load_unit?: string | null
          actual_measure: string
          actual_reps?: number | null
          actual_sets?: number | null
          created_at?: string
          manageable?: boolean | null
          note?: string | null
          pain?: boolean | null
          planned_exercise_app_id: string
          planned_exercise_name_snapshot: string
          planned_exercise_row_id: number
          planned_hold_seconds?: number | null
          planned_measure: string
          planned_reps?: number | null
          planned_sets: number
          row_id?: never
          rpe?: number | null
          session_row_id: number
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_exercise_row_id?: number
          actual_hold_seconds?: number | null
          actual_load?: number | null
          actual_load_unit?: string | null
          actual_measure?: string
          actual_reps?: number | null
          actual_sets?: number | null
          created_at?: string
          manageable?: boolean | null
          note?: string | null
          pain?: boolean | null
          planned_exercise_app_id?: string
          planned_exercise_name_snapshot?: string
          planned_exercise_row_id?: number
          planned_hold_seconds?: number | null
          planned_measure?: string
          planned_reps?: number | null
          planned_sets?: number
          row_id?: never
          rpe?: number | null
          session_row_id?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_logs_actual_exercise_row_id_fkey"
            columns: ["actual_exercise_row_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["row_id"]
          },
          {
            foreignKeyName: "exercise_logs_planned_exercise_fk"
            columns: ["planned_exercise_row_id", "user_id"]
            isOneToOne: false
            referencedRelation: "planned_exercises"
            referencedColumns: ["row_id", "user_id"]
          },
          {
            foreignKeyName: "exercise_logs_session_fk"
            columns: ["session_row_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["row_id", "user_id"]
          },
        ]
      }
      exercises: {
        Row: {
          app_id: string
          created_at: string
          description: string
          difficulty: number
          equipment: string[]
          illustration_alt: string
          is_system: boolean
          measure: string
          movement_category: string
          muscles: string[]
          name: string
          progression_reference: string | null
          regression_reference: string | null
          row_id: number
          safety: string
          slug: string
          source: string
          source_version: string
        }
        Insert: {
          app_id: string
          created_at?: string
          description: string
          difficulty: number
          equipment?: string[]
          illustration_alt: string
          is_system?: boolean
          measure: string
          movement_category: string
          muscles?: string[]
          name: string
          progression_reference?: string | null
          regression_reference?: string | null
          row_id?: never
          safety: string
          slug: string
          source: string
          source_version: string
        }
        Update: {
          app_id?: string
          created_at?: string
          description?: string
          difficulty?: number
          equipment?: string[]
          illustration_alt?: string
          is_system?: boolean
          measure?: string
          movement_category?: string
          muscles?: string[]
          name?: string
          progression_reference?: string | null
          regression_reference?: string | null
          row_id?: never
          safety?: string
          slug?: string
          source?: string
          source_version?: string
        }
        Relationships: []
      }
      foods: {
        Row: {
          app_id: string
          calories: number
          carbs_g: number
          category: string
          confidence: string
          created_at: string
          estimated: boolean
          fat_g: number
          fiber_g: number | null
          is_system: boolean
          name: string
          owner_user_id: string | null
          preparation_basis: string
          protein_g: number
          row_id: number
          serving_grams: number
          serving_label: string
          serving_unit: string
          source: string
          source_version: string
          updated_at: string
        }
        Insert: {
          app_id: string
          calories: number
          carbs_g: number
          category: string
          confidence: string
          created_at?: string
          estimated?: boolean
          fat_g: number
          fiber_g?: number | null
          is_system?: boolean
          name: string
          owner_user_id?: string | null
          preparation_basis?: string
          protein_g: number
          row_id?: never
          serving_grams: number
          serving_label: string
          serving_unit: string
          source: string
          source_version: string
          updated_at?: string
        }
        Update: {
          app_id?: string
          calories?: number
          carbs_g?: number
          category?: string
          confidence?: string
          created_at?: string
          estimated?: boolean
          fat_g?: number
          fiber_g?: number | null
          is_system?: boolean
          name?: string
          owner_user_id?: string | null
          preparation_basis?: string
          protein_g?: number
          row_id?: never
          serving_grams?: number
          serving_label?: string
          serving_unit?: string
          source?: string
          source_version?: string
          updated_at?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          app_id: string
          created_at: string
          desired_rate_kg_per_week: number | null
          effective_date: string
          ended_date: string | null
          goal_type: string
          is_primary: boolean
          row_id: number
          skill_targets: Json
          status: string
          target_date: string | null
          target_weight_kg: number | null
          updated_at: string
          user_id: string
          version: number
          weekly_workout_target: number
        }
        Insert: {
          app_id: string
          created_at?: string
          desired_rate_kg_per_week?: number | null
          effective_date: string
          ended_date?: string | null
          goal_type: string
          is_primary?: boolean
          row_id?: never
          skill_targets?: Json
          status?: string
          target_date?: string | null
          target_weight_kg?: number | null
          updated_at?: string
          user_id: string
          version?: number
          weekly_workout_target: number
        }
        Update: {
          app_id?: string
          created_at?: string
          desired_rate_kg_per_week?: number | null
          effective_date?: string
          ended_date?: string | null
          goal_type?: string
          is_primary?: boolean
          row_id?: never
          skill_targets?: Json
          status?: string
          target_date?: string | null
          target_weight_kg?: number | null
          updated_at?: string
          user_id?: string
          version?: number
          weekly_workout_target?: number
        }
        Relationships: []
      }
      grocery_items: {
        Row: {
          app_id: string
          category: string
          checked: boolean
          created_at: string
          custom_item: boolean
          generated_quantity: number
          grocery_list_row_id: number
          name: string
          quantity: number
          removed: boolean
          row_id: number
          source_food_row_id: number | null
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_id: string
          category: string
          checked?: boolean
          created_at?: string
          custom_item?: boolean
          generated_quantity: number
          grocery_list_row_id: number
          name: string
          quantity: number
          removed?: boolean
          row_id?: never
          source_food_row_id?: number | null
          unit: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_id?: string
          category?: string
          checked?: boolean
          created_at?: string
          custom_item?: boolean
          generated_quantity?: number
          grocery_list_row_id?: number
          name?: string
          quantity?: number
          removed?: boolean
          row_id?: never
          source_food_row_id?: number | null
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grocery_items_list_fk"
            columns: ["grocery_list_row_id", "user_id"]
            isOneToOne: false
            referencedRelation: "grocery_lists"
            referencedColumns: ["row_id", "user_id"]
          },
          {
            foreignKeyName: "grocery_items_source_food_row_id_fkey"
            columns: ["source_food_row_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["row_id"]
          },
        ]
      }
      grocery_lists: {
        Row: {
          app_id: string
          created_at: string
          revision: number
          row_id: number
          updated_at: string
          user_id: string
          week_of: string
        }
        Insert: {
          app_id: string
          created_at?: string
          revision?: number
          row_id?: never
          updated_at?: string
          user_id: string
          week_of: string
        }
        Update: {
          app_id?: string
          created_at?: string
          revision?: number
          row_id?: never
          updated_at?: string
          user_id?: string
          week_of?: string
        }
        Relationships: []
      }
      meal_ingredients: {
        Row: {
          created_at: string
          food_row_id: number
          ingredient_order: number
          meal_row_id: number
          row_id: number
          servings: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          food_row_id: number
          ingredient_order: number
          meal_row_id: number
          row_id?: never
          servings: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          food_row_id?: number
          ingredient_order?: number
          meal_row_id?: number
          row_id?: never
          servings?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_ingredients_food_row_id_fkey"
            columns: ["food_row_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["row_id"]
          },
          {
            foreignKeyName: "meal_ingredients_meal_row_id_fkey"
            columns: ["meal_row_id"]
            isOneToOne: false
            referencedRelation: "meals"
            referencedColumns: ["row_id"]
          },
        ]
      }
      meal_plans: {
        Row: {
          app_id: string
          created_at: string
          row_id: number
          supersedes_plan_row_id: number | null
          target_row_id: number
          user_id: string
          version: number
          week_of: string
        }
        Insert: {
          app_id: string
          created_at?: string
          row_id?: never
          supersedes_plan_row_id?: number | null
          target_row_id: number
          user_id: string
          version: number
          week_of: string
        }
        Update: {
          app_id?: string
          created_at?: string
          row_id?: never
          supersedes_plan_row_id?: number | null
          target_row_id?: number
          user_id?: string
          version?: number
          week_of?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plans_supersedes_fk"
            columns: ["supersedes_plan_row_id", "user_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["row_id", "user_id"]
          },
          {
            foreignKeyName: "meal_plans_target_fk"
            columns: ["target_row_id", "user_id"]
            isOneToOne: false
            referencedRelation: "daily_targets"
            referencedColumns: ["row_id", "user_id"]
          },
        ]
      }
      meals: {
        Row: {
          app_id: string
          archived_at: string | null
          created_at: string
          is_system: boolean
          name: string
          notes: string | null
          owner_user_id: string | null
          revision: number
          row_id: number
          servings: number
          source_url: string | null
          updated_at: string
        }
        Insert: {
          app_id: string
          archived_at?: string | null
          created_at?: string
          is_system?: boolean
          name: string
          notes?: string | null
          owner_user_id?: string | null
          revision?: number
          row_id?: never
          servings: number
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          app_id?: string
          archived_at?: string | null
          created_at?: string
          is_system?: boolean
          name?: string
          notes?: string | null
          owner_user_id?: string | null
          revision?: number
          row_id?: never
          servings?: number
          source_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      mutation_idempotency: {
        Row: {
          completed_at: string | null
          created_at: string
          error_code: string | null
          expires_at: string | null
          idempotency_key: string
          operation: string
          request_hash: string
          result_refs: Json
          row_id: number
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          expires_at?: string | null
          idempotency_key: string
          operation: string
          request_hash: string
          result_refs?: Json
          row_id?: never
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          expires_at?: string | null
          idempotency_key?: string
          operation?: string
          request_hash?: string
          result_refs?: Json
          row_id?: never
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      nutrition_logs: {
        Row: {
          app_id: string
          assumptions: string | null
          calories: number
          carbs_g: number
          confidence: string
          created_at: string
          custom_name: string | null
          estimated: boolean
          fat_g: number
          fiber_g: number | null
          food_row_id: number | null
          idempotency_key: string | null
          log_date: string
          meal_slot: string
          preparation_basis: string
          protein_g: number
          revision: number
          row_id: number
          serving_quantity: number
          serving_unit: string
          servings: number
          source: string
          source_version: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_id: string
          assumptions?: string | null
          calories: number
          carbs_g: number
          confidence: string
          created_at?: string
          custom_name?: string | null
          estimated?: boolean
          fat_g: number
          fiber_g?: number | null
          food_row_id?: number | null
          idempotency_key?: string | null
          log_date: string
          meal_slot: string
          preparation_basis?: string
          protein_g: number
          revision?: number
          row_id?: never
          serving_quantity: number
          serving_unit?: string
          servings: number
          source: string
          source_version?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_id?: string
          assumptions?: string | null
          calories?: number
          carbs_g?: number
          confidence?: string
          created_at?: string
          custom_name?: string | null
          estimated?: boolean
          fat_g?: number
          fiber_g?: number | null
          food_row_id?: number | null
          idempotency_key?: string | null
          log_date?: string
          meal_slot?: string
          preparation_basis?: string
          protein_g?: number
          revision?: number
          row_id?: never
          serving_quantity?: number
          serving_unit?: string
          servings?: number
          source?: string
          source_version?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_logs_food_row_id_fkey"
            columns: ["food_row_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["row_id"]
          },
        ]
      }
      planned_exercises: {
        Row: {
          app_id: string
          catalog_source_version: string
          created_at: string
          exercise_name_snapshot: string
          exercise_row_id: number
          hold_seconds: number | null
          measure_snapshot: string
          planned_workout_row_id: number
          progression_reference_snapshot: string | null
          regression_reference_snapshot: string | null
          reps: number | null
          rest_seconds: number
          row_id: number
          sets: number
          slot_key: string
          sort_order: number
          user_id: string
        }
        Insert: {
          app_id: string
          catalog_source_version: string
          created_at?: string
          exercise_name_snapshot: string
          exercise_row_id: number
          hold_seconds?: number | null
          measure_snapshot: string
          planned_workout_row_id: number
          progression_reference_snapshot?: string | null
          regression_reference_snapshot?: string | null
          reps?: number | null
          rest_seconds: number
          row_id?: never
          sets: number
          slot_key: string
          sort_order: number
          user_id: string
        }
        Update: {
          app_id?: string
          catalog_source_version?: string
          created_at?: string
          exercise_name_snapshot?: string
          exercise_row_id?: number
          hold_seconds?: number | null
          measure_snapshot?: string
          planned_workout_row_id?: number
          progression_reference_snapshot?: string | null
          regression_reference_snapshot?: string | null
          reps?: number | null
          rest_seconds?: number
          row_id?: never
          sets?: number
          slot_key?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planned_exercises_exercise_row_id_fkey"
            columns: ["exercise_row_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["row_id"]
          },
          {
            foreignKeyName: "planned_exercises_workout_fk"
            columns: ["planned_workout_row_id", "user_id"]
            isOneToOne: false
            referencedRelation: "planned_workouts"
            referencedColumns: ["row_id", "user_id"]
          },
        ]
      }
      planned_meals: {
        Row: {
          app_id: string
          assumptions: string | null
          confidence: string | null
          created_at: string
          expected_calories: number
          expected_carbs_g: number
          expected_fat_g: number
          expected_fiber_g: number | null
          expected_protein_g: number
          food_row_id: number | null
          label: string
          meal_date: string
          meal_plan_row_id: number
          meal_row_id: number | null
          meal_slot: string
          preparation_basis: string | null
          row_id: number
          servings: number
          skipped: boolean
          slot_key: string
          sort_order: number
          source: string | null
          source_version: string | null
          updated_at: string
          user_id: string
          week_of: string
        }
        Insert: {
          app_id: string
          assumptions?: string | null
          confidence?: string | null
          created_at?: string
          expected_calories?: number
          expected_carbs_g?: number
          expected_fat_g?: number
          expected_fiber_g?: number | null
          expected_protein_g?: number
          food_row_id?: number | null
          label: string
          meal_date: string
          meal_plan_row_id: number
          meal_row_id?: number | null
          meal_slot: string
          preparation_basis?: string | null
          row_id?: never
          servings: number
          skipped?: boolean
          slot_key: string
          sort_order: number
          source?: string | null
          source_version?: string | null
          updated_at?: string
          user_id: string
          week_of: string
        }
        Update: {
          app_id?: string
          assumptions?: string | null
          confidence?: string | null
          created_at?: string
          expected_calories?: number
          expected_carbs_g?: number
          expected_fat_g?: number
          expected_fiber_g?: number | null
          expected_protein_g?: number
          food_row_id?: number | null
          label?: string
          meal_date?: string
          meal_plan_row_id?: number
          meal_row_id?: number | null
          meal_slot?: string
          preparation_basis?: string | null
          row_id?: never
          servings?: number
          skipped?: boolean
          slot_key?: string
          sort_order?: number
          source?: string | null
          source_version?: string | null
          updated_at?: string
          user_id?: string
          week_of?: string
        }
        Relationships: [
          {
            foreignKeyName: "planned_meals_food_row_id_fkey"
            columns: ["food_row_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["row_id"]
          },
          {
            foreignKeyName: "planned_meals_meal_row_id_fkey"
            columns: ["meal_row_id"]
            isOneToOne: false
            referencedRelation: "meals"
            referencedColumns: ["row_id"]
          },
          {
            foreignKeyName: "planned_meals_plan_fk"
            columns: ["meal_plan_row_id", "user_id", "week_of"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["row_id", "user_id", "week_of"]
          },
        ]
      }
      planned_workouts: {
        Row: {
          app_id: string
          cooldown: string[]
          created_at: string
          day_of_week: number
          estimated_minutes: number
          focus: string
          plan_row_id: number
          row_id: number
          sort_order: number
          title: string
          user_id: string
          warmup: string[]
        }
        Insert: {
          app_id: string
          cooldown?: string[]
          created_at?: string
          day_of_week: number
          estimated_minutes: number
          focus: string
          plan_row_id: number
          row_id?: never
          sort_order?: number
          title: string
          user_id: string
          warmup?: string[]
        }
        Update: {
          app_id?: string
          cooldown?: string[]
          created_at?: string
          day_of_week?: number
          estimated_minutes?: number
          focus?: string
          plan_row_id?: number
          row_id?: never
          sort_order?: number
          title?: string
          user_id?: string
          warmup?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "planned_workouts_plan_fk"
            columns: ["plan_row_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["row_id", "user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          age: number
          allergies: string[]
          cooking_time_minutes: number | null
          created_at: string
          days_per_week: number
          dietary_pattern: string
          eligibility_status: string
          eligibility_version: string
          equipment: string[]
          experience: string
          food_preferences: string[]
          goal: string
          height_cm: number
          id: string
          meal_budget: number | null
          name: string
          revision: number
          session_minutes: number
          sex: string
          units: string
          updated_at: string
          weight_kg: number
        }
        Insert: {
          age: number
          allergies?: string[]
          cooking_time_minutes?: number | null
          created_at?: string
          days_per_week: number
          dietary_pattern?: string
          eligibility_status?: string
          eligibility_version?: string
          equipment?: string[]
          experience: string
          food_preferences?: string[]
          goal: string
          height_cm: number
          id: string
          meal_budget?: number | null
          name: string
          revision?: number
          session_minutes: number
          sex: string
          units: string
          updated_at?: string
          weight_kg: number
        }
        Update: {
          age?: number
          allergies?: string[]
          cooking_time_minutes?: number | null
          created_at?: string
          days_per_week?: number
          dietary_pattern?: string
          eligibility_status?: string
          eligibility_version?: string
          equipment?: string[]
          experience?: string
          food_preferences?: string[]
          goal?: string
          height_cm?: number
          id?: string
          meal_budget?: number | null
          name?: string
          revision?: number
          session_minutes?: number
          sex?: string
          units?: string
          updated_at?: string
          weight_kg?: number
        }
        Relationships: []
      }
      progression_decisions: {
        Row: {
          action: string
          app_id: string
          created_at: string
          decision: string
          planned_exercise_app_id: string
          proposed_hold_seconds: number | null
          proposed_replacement_exercise_id: string | null
          proposed_reps: number | null
          proposed_sets: number | null
          row_id: number
          rule_version: string
          slot_key: string
          source_session_ids: string[]
          user_id: string
        }
        Insert: {
          action: string
          app_id: string
          created_at?: string
          decision: string
          planned_exercise_app_id: string
          proposed_hold_seconds?: number | null
          proposed_replacement_exercise_id?: string | null
          proposed_reps?: number | null
          proposed_sets?: number | null
          row_id?: never
          rule_version: string
          slot_key: string
          source_session_ids?: string[]
          user_id: string
        }
        Update: {
          action?: string
          app_id?: string
          created_at?: string
          decision?: string
          planned_exercise_app_id?: string
          proposed_hold_seconds?: number | null
          proposed_replacement_exercise_id?: string | null
          proposed_reps?: number | null
          proposed_sets?: number | null
          row_id?: never
          rule_version?: string
          slot_key?: string
          source_session_ids?: string[]
          user_id?: string
        }
        Relationships: []
      }
      weight_entries: {
        Row: {
          app_id: string
          created_at: string
          entry_date: string
          row_id: number
          user_id: string
          weight_kg: number
        }
        Insert: {
          app_id: string
          created_at?: string
          entry_date: string
          row_id?: never
          user_id: string
          weight_kg: number
        }
        Update: {
          app_id?: string
          created_at?: string
          entry_date?: string
          row_id?: never
          user_id?: string
          weight_kg?: number
        }
        Relationships: []
      }
      workout_plan_overrides: {
        Row: {
          active: boolean
          app_id: string
          created_at: string
          effective_at: string
          ended_at: string | null
          hold_seconds_override: number | null
          measure_override: string | null
          planned_exercise_row_id: number
          replacement_exercise_row_id: number | null
          reps_override: number | null
          rest_seconds_override: number | null
          row_id: number
          sets_override: number | null
          slot_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          app_id: string
          created_at?: string
          effective_at?: string
          ended_at?: string | null
          hold_seconds_override?: number | null
          measure_override?: string | null
          planned_exercise_row_id: number
          replacement_exercise_row_id?: number | null
          reps_override?: number | null
          rest_seconds_override?: number | null
          row_id?: never
          sets_override?: number | null
          slot_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          app_id?: string
          created_at?: string
          effective_at?: string
          ended_at?: string | null
          hold_seconds_override?: number | null
          measure_override?: string | null
          planned_exercise_row_id?: number
          replacement_exercise_row_id?: number | null
          reps_override?: number | null
          rest_seconds_override?: number | null
          row_id?: never
          sets_override?: number | null
          slot_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_plan_overrides_exercise_fk"
            columns: ["planned_exercise_row_id", "user_id"]
            isOneToOne: false
            referencedRelation: "planned_exercises"
            referencedColumns: ["row_id", "user_id"]
          },
          {
            foreignKeyName: "workout_plan_overrides_replacement_exercise_row_id_fkey"
            columns: ["replacement_exercise_row_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["row_id"]
          },
        ]
      }
      workout_plans: {
        Row: {
          app_id: string
          created_at: string
          row_id: number
          supersedes_plan_row_id: number | null
          target_row_id: number
          user_id: string
          version: number
        }
        Insert: {
          app_id: string
          created_at?: string
          row_id?: never
          supersedes_plan_row_id?: number | null
          target_row_id: number
          user_id: string
          version: number
        }
        Update: {
          app_id?: string
          created_at?: string
          row_id?: never
          supersedes_plan_row_id?: number | null
          target_row_id?: number
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "workout_plans_supersedes_fk"
            columns: ["supersedes_plan_row_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["row_id", "user_id"]
          },
          {
            foreignKeyName: "workout_plans_target_fk"
            columns: ["target_row_id", "user_id"]
            isOneToOne: false
            referencedRelation: "daily_targets"
            referencedColumns: ["row_id", "user_id"]
          },
        ]
      }
      workout_sessions: {
        Row: {
          app_id: string
          created_at: string
          finished_at: string | null
          idempotency_key: string | null
          planned_plan_row_id: number
          planned_plan_version: number
          planned_workout_row_id: number
          row_id: number
          session_date: string
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_id: string
          created_at?: string
          finished_at?: string | null
          idempotency_key?: string | null
          planned_plan_row_id: number
          planned_plan_version: number
          planned_workout_row_id: number
          row_id?: never
          session_date: string
          started_at: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_id?: string
          created_at?: string
          finished_at?: string | null
          idempotency_key?: string | null
          planned_plan_row_id?: number
          planned_plan_version?: number
          planned_workout_row_id?: number
          row_id?: never
          session_date?: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_sessions_plan_fk"
            columns: ["planned_plan_row_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["row_id", "user_id"]
          },
          {
            foreignKeyName: "workout_sessions_workout_fk"
            columns: ["planned_workout_row_id", "user_id"]
            isOneToOne: false
            referencedRelation: "planned_workouts"
            referencedColumns: ["row_id", "user_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      abandon_workout_session: { Args: { p_payload: Json }; Returns: Json }
      add_custom_grocery_item: { Args: { p_payload: Json }; Returns: Json }
      apply_progression_decision: { Args: { p_payload: Json }; Returns: Json }
      apply_workout_override: { Args: { p_payload: Json }; Returns: Json }
      archive_saved_meal: { Args: { p_payload: Json }; Returns: Json }
      complete_onboarding: { Args: { p_payload: Json }; Returns: Json }
      delete_account: { Args: { p_payload: Json }; Returns: Json }
      delete_nutrition_log: { Args: { p_payload: Json }; Returns: Json }
      edit_meal_plan: { Args: { p_payload: Json }; Returns: Json }
      export_account_data: { Args: { p_payload: Json }; Returns: Json }
      finish_workout_session: { Args: { p_payload: Json }; Returns: Json }
      log_saved_meal: { Args: { p_payload: Json }; Returns: Json }
      regenerate_grocery: { Args: { p_payload: Json }; Returns: Json }
      remove_grocery_item: { Args: { p_payload: Json }; Returns: Json }
      remove_workout_override: { Args: { p_payload: Json }; Returns: Json }
      reset_plan: { Args: { p_payload: Json }; Returns: Json }
      save_nutrition_log: { Args: { p_payload: Json }; Returns: Json }
      save_recipe: { Args: { p_payload: Json }; Returns: Json }
      save_saved_meal: { Args: { p_payload: Json }; Returns: Json }
      save_weight_entry: { Args: { p_payload: Json }; Returns: Json }
      save_workout_session: { Args: { p_payload: Json }; Returns: Json }
      set_grocery_quantity: { Args: { p_payload: Json }; Returns: Json }
      skip_planned_meal: { Args: { p_payload: Json }; Returns: Json }
      start_workout_session: { Args: { p_payload: Json }; Returns: Json }
      toggle_grocery_item: { Args: { p_payload: Json }; Returns: Json }
      update_profile: { Args: { p_payload: Json }; Returns: Json }
      update_units: { Args: { p_payload: Json }; Returns: Json }
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

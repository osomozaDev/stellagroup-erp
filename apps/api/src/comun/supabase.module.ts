import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE = 'SUPABASE';

@Global()
@Module({
  providers: [
    {
      provide: SUPABASE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): SupabaseClient =>
        createClient(config.getOrThrow('SUPABASE_URL'), config.getOrThrow('SUPABASE_SERVICE_ROLE_KEY'), {
          auth: { persistSession: false, autoRefreshToken: false },
        }),
    },
  ],
  exports: [SUPABASE],
})
export class SupabaseModule {}

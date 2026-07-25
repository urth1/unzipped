import { createClient } from '@supabase/supabase-js';

// Replace these strings with your exact keys from the Supabase dashboard
const supabaseUrl = 'https://mvtsxxbjndypgunbcoel.supabase.co'; 
const supabaseAnonKey = 'sb_publishable_D7pYSYPHcAKOIL2vqayUGA_9fokGNv8'; 

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
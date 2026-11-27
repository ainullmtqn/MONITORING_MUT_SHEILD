import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yhtvyongrbpmscvslgks.supabase.co';
const supabaseKey = 'sb_publishable_Ys8kCYOZyB5u5ze7yArtew_PKscjpK8';

export const supabase = createClient(supabaseUrl, supabaseKey);

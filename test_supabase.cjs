const { createClient } = require('@supabase/supabase-js')
const url = "https://wtrycmiojsiliyjxsewz.supabase.co"
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdWJhc2UiLCJyZWxlYXNlIjoicHJpbWFyeSIsInJlZiI6Ind0cnljbWlvanNpbGl5anhzZXd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjcwOTA1NywiZXhwIjoyMDkyMjg1MDU3fQ.4S3F3Nc8sV1m1J2gM_fJ0iNa2UjNGG2Ap2RqpKJbzsM"
const supabase = createClient(url, key)
supabase.from('rooms').select('count').then(({ data, error }) => {
    if (error) console.error('Error:', error.message)
    else console.log('Success, data:', data)
})

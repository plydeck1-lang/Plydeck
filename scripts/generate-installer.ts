import { readFileSync, writeFileSync } from "node:fs";

const files = [
  "001_plydeck.sql",
  "002_replacement_slots.sql",
  "003_whatsapp_notifications.sql",
  "004_whatsapp_delivery_fixes.sql",
  "005_independent_thickness_quantities.sql",
  "006_fixed_100_sheet_slot_mix.sql",
  "007_fixed_four_item_slot.sql",
];

let sql = `-- PLYDECK: ONE-FILE INSTALLER FOR A NEW, EMPTY SUPABASE PROJECT ONLY.
-- Includes migrations 001 through 007 and the seed. Run the ENTIRE file once.
-- Do NOT run the individual migrations afterwards; they are already included.
-- Existing installations: follow supabase/README_SQL.md instead.
-- No credentials or administrator assignments are included.
begin;
do $$begin
 if to_regclass('public.pools') is not null or to_regclass('public.profiles') is not null or to_regclass('public.orders') is not null then
  raise exception 'Existing tables found. Use the upgrade instructions instead of the new-project installer.';
 end if;
end;$$;
`;

for (const file of files) {
  sql += `\n-- Included file: ${file}\n${readFileSync(`supabase/migrations/${file}`, "utf8").trim()}\n`;
}
sql += `\n-- Included file: seed.sql\n${readFileSync("supabase/seed.sql", "utf8").trim()}\n\ncommit;\n`;
writeFileSync("supabase/install/PLYDECK_NEW_PROJECT_SETUP.sql", sql);

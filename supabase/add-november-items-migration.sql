-- Adds the products from the November receipt to the learned-name catalog and
-- repairs trips that were created before these names were known.
insert into public.product_names (item_code, display_name, source, confidence)
values
  ('384732', 'Kirkland Signature Pure Sea Salt, 30 oz', 'seed', 1),
  ('164981', 'Kirkland Signature Fine Ground Black Pepper, 12.3 oz', 'seed', 1),
  ('96928', 'Kraft Singles American Cheese, 96 Slices, 4 lbs', 'seed', 1)
on conflict (item_code) do update set
  display_name = excluded.display_name,
  source = excluded.source,
  confidence = excluded.confidence,
  updated_at = now();

update public.items
set name = case item_code
  when '384732' then 'Kirkland Signature Pure Sea Salt, 30 oz'
  when '164981' then 'Kirkland Signature Fine Ground Black Pepper, 12.3 oz'
  when '96928' then 'Kraft Singles American Cheese, 96 Slices, 4 lbs'
end
where item_code in ('384732', '164981', '96928');

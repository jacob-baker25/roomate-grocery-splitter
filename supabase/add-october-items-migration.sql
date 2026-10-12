-- Updates items that were already saved before these Costco item numbers
-- were added to the app's friendly-name lookup.

update public.items as item
set name = friendly.name
from (values
  ('2067029', 'Tide Pods Unstopables Laundry Detergent, Fresh, 80-count'),
  ('2848101', 'Cascade Complete Shine Boost Dishwasher ActionPacs, Fresh, 92-count'),
  ('1668206', 'Real Good Foods Lightly Breaded Chicken Strips, 3 lb'),
  ('33593', 'USDA Choice Beef Loin New York Strip Steak'),
  ('22041', 'Kirkland Boneless Skinless Chicken Thighs'),
  ('1717856', 'Scotch-Brite Zero Scratch Sponges, 24-count'),
  ('2046269', 'Mrs. Meyer''s Clean Day Hand Soap Variety Pack, 4-count'),
  ('1478988', 'Kinder''s Buttery Garlic & Herb Seasoning'),
  ('692731', 'Kirkland Organic Extra Virgin Olive Oil')
) as friendly(item_code, name)
where item.item_code = friendly.item_code
  and item.name is distinct from friendly.name;

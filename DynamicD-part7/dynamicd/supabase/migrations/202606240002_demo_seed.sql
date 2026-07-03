-- 첫 화면에서 바로 사용할 수 있는 기본 뽑기·상품·교환 규칙
insert into public.draws(id, name, slug, description, status, animation_ms, is_public)
values('11111111-1111-4111-8111-111111111111', '입장권 뽑기', 'ticket-draw', '입장권을 모아 DwX 또는 Dynamic 상품으로 교환하는 대표 이벤트입니다.', 'ACTIVE', 4000, true)
on conflict(id) do update set name = excluded.name, description = excluded.description, animation_ms = excluded.animation_ms, is_public = true;

insert into public.rewards(id, draw_id, name, description, color, probability_units, stock, is_inventory_item, is_exchange_material, is_active, sort_order)
values
('22222222-2222-4222-8222-222222222221', '11111111-1111-4111-8111-111111111111', '꽝', '다음 기회를 노려보세요.', '#64748b', 550000, null, false, false, true, 10),
('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', '찢어진 입장권', '모아서 다른 상품으로 교환할 수 있습니다.', '#38bdf8', 400000, null, true, true, true, 20),
('22222222-2222-4222-8222-222222222223', '11111111-1111-4111-8111-111111111111', 'DwX', '희귀 등급 상품', '#a78bfa', 40000, 40, true, false, true, 30),
('22222222-2222-4222-8222-222222222224', '11111111-1111-4111-8111-111111111111', 'Dynamic', '최고 등급 상품', '#fbbf24', 10000, 10, true, false, true, 40)
on conflict(id) do update set
  description = excluded.description,
  color = excluded.color,
  probability_units = excluded.probability_units,
  is_inventory_item = excluded.is_inventory_item,
  is_exchange_material = excluded.is_exchange_material,
  is_active = true,
  sort_order = excluded.sort_order;

insert into public.exchange_rules(id, name, source_reward_id, source_quantity, target_reward_id, target_quantity, is_active, sort_order)
values
('33333333-3333-4333-8333-333333333331', '찢어진 입장권 5개 → DwX', '22222222-2222-4222-8222-222222222222', 5, '22222222-2222-4222-8222-222222222223', 1, true, 10),
('33333333-3333-4333-8333-333333333332', '찢어진 입장권 8개 → Dynamic', '22222222-2222-4222-8222-222222222222', 8, '22222222-2222-4222-8222-222222222224', 1, true, 20)
on conflict(id) do update set name = excluded.name, source_quantity = excluded.source_quantity, target_quantity = excluded.target_quantity, is_active = true, sort_order = excluded.sort_order;

-- Лимит теперь у каждого раздела меню: не больше max_qty штук из раздела в одном заказе (NULL — без лимита).
-- counts_in_limit теперь значит только «занимает место на кухне» и влияет на расчёт времени готовности.
ALTER TABLE categories ADD COLUMN max_qty int CHECK (max_qty IS NULL OR max_qty BETWEEN 1 AND 20);
UPDATE categories SET max_qty = 2;
UPDATE categories SET counts_in_limit = false WHERE names->>'ru' = 'Закуски';

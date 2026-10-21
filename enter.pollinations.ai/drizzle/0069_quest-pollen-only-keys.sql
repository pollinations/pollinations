-- A Quest Pollen only key never spends the owner's paid balance: requests stop
-- when Quest Pollen runs out instead of falling through to paid Pollen.
ALTER TABLE `apikey` ADD `quest_pollen_only` integer DEFAULT false NOT NULL;

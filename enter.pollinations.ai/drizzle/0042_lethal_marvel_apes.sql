ALTER TABLE `community_endpoint` ADD `input_modalities` text;
--> statement-breakpoint
UPDATE `community_endpoint`
SET `input_modalities` = CASE
    WHEN `modality` = 'image' AND `supports_image_edits` = 1
        THEN '["text","image"]'
    ELSE '["text"]'
END
WHERE `input_modalities` IS NULL;

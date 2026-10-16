-- The internal dashboards now answer only on *.pollinations.ai, and their old
-- *.myceli.ai hosts redirect there, so drop the *.myceli.ai callbacks that
-- 0063 registered next to the pollinations.ai ones.
UPDATE `oauth_client`
   SET `redirect_uris` = (
       SELECT json_group_array(`value`) FROM json_each(`oauth_client`.`redirect_uris`)
        WHERE `value` NOT LIKE 'https://%.myceli.ai/%'
   )
 WHERE `redirect_uris` LIKE '%.myceli.ai/%';

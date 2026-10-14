UPDATE `agent`
SET `config` = json_set(
	json_remove(`config`, '$.pollinationsTools', '$.mcpServers'),
	'$.mcpServers',
	CASE
		WHEN json_extract(`config`, '$.pollinationsTools') = 1
			THEN json_array('pollinations')
		ELSE json_array()
	END
);
--> statement-breakpoint
ALTER TABLE `agent` DROP COLUMN `mcp_headers_ciphertext`;

const tableName = "user"

export async function up(knex) {
	await knex.schema.createTable(tableName, table => {
		table.increments("id")
		table.string("username", 100).notNullable().unique()
	})
	///////
}

export async function down(knex) {
	await knex.schema.dropTable(tableName)
}

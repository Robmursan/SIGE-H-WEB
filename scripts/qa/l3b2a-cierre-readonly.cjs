// Closure audit only: SELECT/catalog reads, READ ONLY transaction; no fixture runner.
"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const ROOT = path.resolve(__dirname, "../.."),
  qa = require("./d22-preflight.cjs");
const check = (ok, code) => {
  if (!ok) throw Error(code);
};
const same = (a, b, code) =>
  check(JSON.stringify(a) === JSON.stringify(b), code);
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const report = {
  status: "BLOCKED",
  observed_at: new Date().toISOString(),
  sql_data_writes: 0,
  fixtures_created: 0,
};
let admin;
(async () => {
  try {
    check(
      process.env.SIGEH_L3B2A_CIERRE_READONLY === "1",
      "explicit_readonly_opt_in",
    );
    report.container = qa.container();
    const proof = JSON.parse(
      fs.readFileSync(ROOT + "/artifacts/permissions/l3b2a-resultado.json"),
    );
    const grantsProof = JSON.parse(
      fs.readFileSync(ROOT + "/artifacts/permissions/l3b1-resultado.json"),
    );
    const snapPath = grantsProof.snapshot_directory + "/after.json";
    check(
      snapPath.startsWith("/home/robreport/.config/sigeh/backups/"),
      "snapshot_path",
    );
    const bytes = fs.readFileSync(snapPath);
    check(sha(bytes) === grantsProof.after_sha256, "snapshot_checksum");
    const expected = JSON.parse(bytes);
    admin = qa.client(
      "sigeh_qa_bootstrap",
      qa.secret("/home/robreport/.config/sigeh/qa-bootstrap-password"),
    );
    await admin.connect();
    check(admin.scram.sasl && admin.scram.final, "bootstrap_scram");
    qa.bindAdmin(admin);
    await admin.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    report.identity = (
      await qa.q(
        "SELECT current_database() AS database,current_user AS role,session_user AS login,current_setting('server_version') AS version,current_setting('transaction_read_only') AS read_only,(SELECT system_identifier::text FROM pg_control_system()) AS cluster",
      )
    )[0];
    check(
      report.identity.database === "sigeh_qa" &&
        report.identity.role === "sigeh_qa_bootstrap" &&
        report.identity.login === report.identity.role &&
        report.identity.cluster === "7707094012630982690" &&
        report.identity.version === "17.11" &&
        report.identity.read_only === "on",
      "qa_identity",
    );
    report.inventory = await qa.structure();
    same(report.inventory, proof.final_inventory, "inventory_drift");
    same(await qa.fullStructure(), expected.structure, "definition_drift");
    const direct = await qa.direct();
    same(direct, expected.direct, "direct_acl_drift");
    report.direct_entries = direct.length;
    check(direct.length === 100, "direct_count");
    same(await qa.otherAcl(), expected.other_acl, "other_acl_drift");
    const q = qa.q;
    report.app_role = (
      await q(
        "SELECT oid,rolname,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname='sigeh_qa_app'",
      )
    )[0];
    same(report.app_role, expected.acl.role[0], "app_attributes");
    report.app_memberships = (
      await q(
        "SELECT count(*)::int AS n FROM pg_auth_members WHERE member='sigeh_qa_app'::regrole OR roleid='sigeh_qa_app'::regrole",
      )
    )[0].n;
    check(report.app_memberships === 0, "app_memberships");
    check(
      (
        await q(
          "SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid='sigeh_qa_app'::regrole AND deptype='o'",
        )
      ).length === 0,
      "app_ownership",
    );
    const tables = await q(
      "SELECT oid,relname FROM pg_class WHERE relnamespace='sigeh'::regnamespace AND relkind='r' ORDER BY relname",
    );
    report.row_counts = (await qa.rowCounts(tables)).map((x) => ({
      table: x.table,
      n: x.count,
    }));
    same(report.row_counts, proof.final_rows, "row_count_drift");
    const codes = proof.catalog_registered.map((x) => x.code);
    report.faculties = await q(
      "SELECT permiso_id AS id,codigo AS code FROM sigeh.permisos WHERE codigo=ANY($1::text[]) ORDER BY codigo",
      [codes],
    );
    same(
      report.faculties,
      proof.catalog_registered
        .slice()
        .sort((a, b) => a.code.localeCompare(b.code)),
      "catalog_drift",
    );
    const ids = report.faculties.map((x) => x.id);
    report.role_assignments = (
      await q(
        "SELECT count(*)::int AS n FROM sigeh.rol_permisos WHERE permiso_id=ANY($1::uuid[])",
        [ids],
      )
    )[0].n;
    report.encargo_assignments = (
      await q(
        "SELECT count(*)::int AS n FROM sigeh.encargo_permisos WHERE permiso_id=ANY($1::uuid[])",
        [ids],
      )
    )[0].n;
    check(
      report.role_assignments === 0 && report.encargo_assignments === 0,
      "unexpected_faculty_assignment",
    );
    const effective = {
      tables: await q(
        "SELECT n.nspname,c.relname,p.priv FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(priv) WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_' AND CASE WHEN c.relkind IN ('r','v','m','p','f') THEN has_table_privilege('sigeh_qa_app',c.oid,p.priv) ELSE false END ORDER BY 1,2,3",
      ),
      columns: await q(
        "SELECT n.nspname,c.relname AS object,a.attname AS column,p.priv FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(priv) WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_' AND a.attnum>0 AND NOT a.attisdropped AND CASE WHEN c.relkind IN ('r','v','m','p','f') THEN has_column_privilege('sigeh_qa_app',c.oid,a.attnum,p.priv) ELSE false END ORDER BY 1,2,3,4",
      ),
      sequences: await q(
        "SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_' AND CASE WHEN c.relkind='S' THEN has_sequence_privilege('sigeh_qa_app',c.oid,'SELECT,UPDATE,USAGE') ELSE false END ORDER BY 1,2",
      ),
    };
    same(effective, expected.effective, "effective_acl_drift");
    report.effective_acl = "MATCH_L3B1";
    report.rls = await q(
      "SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='sigeh'::regnamespace AND relname=ANY($1::text[]) ORDER BY relname",
      [
        [
          "empleados",
          "contratos",
          "adscripciones",
          "programacion_laboral",
          "horarios",
        ],
      ],
    );
    report.active_app_sessions = (
      await q(
        "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND usename='sigeh_qa_app'",
      )
    )[0].n;
    await admin.query("ROLLBACK");
    report.backup = {
      exists: fs.existsSync(grantsProof.backup.path),
      sha256: sha(fs.readFileSync(grantsProof.backup.path)),
      mode: (fs.statSync(grantsProof.backup.path).mode & 0o777).toString(8),
    };
    check(
      report.backup.exists &&
        report.backup.sha256 === grantsProof.backup.sha256 &&
        report.backup.mode === "600",
      "backup_drift",
    );
    report.status = "PASS";
  } catch (e) {
    report.error =
      e.code || (/^[a-z_]+$/.test(e.message) ? e.message : "sanitized_error");
  } finally {
    if (admin) await admin.end().catch(() => {});
    fs.writeFileSync(
      "/tmp/sigeh-l3b2a-cierre-qa.json",
      JSON.stringify(report, null, 2) + "\n",
      { mode: 0o600 },
    );
    const brief = { ...report };
    delete brief.row_counts;
    console.log(JSON.stringify(brief));
    process.exitCode = report.status === "PASS" ? 0 : 1;
  }
})();

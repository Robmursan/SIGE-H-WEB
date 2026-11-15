-- C1: SOLO SELECT; no consulta filas hospitalarias ni verificadores de contraseña.
SELECT current_database(), current_user, current_setting('server_version'),
 current_setting('search_path'), current_setting('password_encryption'), current_setting('ssl');
SELECT rolname,rolsuper,rolinherit,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolcanlogin
 FROM pg_roles WHERE rolname LIKE 'sigeh%';
SELECT pg_get_userbyid(roleid) AS role,pg_get_userbyid(member) AS member,
 admin_option,inherit_option,set_option FROM pg_auth_members;
SELECT datname,pg_get_userbyid(datdba) AS owner,datacl FROM pg_database;
SELECT nspname,pg_get_userbyid(nspowner) AS owner,nspacl FROM pg_namespace;
SELECT n.nspname,c.relname,c.relkind,pg_get_userbyid(c.relowner) AS owner,
 c.relacl,c.relrowsecurity,c.relforcerowsecurity
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('sigeh','public') ORDER BY 1,2;
SELECT n.nspname,c.relname,a.attname,a.attacl FROM pg_attribute a
 JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE a.attacl IS NOT NULL AND NOT a.attisdropped;
SELECT n.nspname,p.oid::regprocedure AS routine,pg_get_userbyid(p.proowner) AS owner,
 p.prosecdef,p.proconfig,p.proacl FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('sigeh','public') OR p.prosecdef;
SELECT extname,pg_get_userbyid(extowner) AS owner,extnamespace::regnamespace FROM pg_extension;
SELECT defaclrole::regrole,defaclnamespace::regnamespace,defaclobjtype,defaclacl FROM pg_default_acl;
SELECT setdatabase,setrole,setconfig FROM pg_db_role_setting;
SELECT rule_number,type,database,user_name,address,netmask,auth_method,error FROM pg_hba_file_rules;
-- ACL NULL significa defaults, no ausencia de privilegios. grantee=0 identifica PUBLIC.
SELECT d.datname,a.* FROM pg_database d,
 LATERAL aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba))) a;
SELECT n.nspname,a.* FROM pg_namespace n,
 LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a
 WHERE n.nspname IN ('public','sigeh');

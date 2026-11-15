-- C1.1 SOLO LECTURA. No recupera verificadores, secretos ni filas de negocio.
SELECT current_database(),current_user,current_setting('server_version'),
 current_setting('hba_file'),current_setting('config_file'),current_setting('data_directory'),
 current_setting('password_encryption'),current_setting('ssl'),current_setting('listen_addresses'),
 current_setting('port'),pg_conf_load_time();
SELECT rule_number,file_name,line_number,type,database,user_name,address,netmask,auth_method,error
 FROM pg_hba_file_rules ORDER BY rule_number;
SELECT pg_conf_load_time(),(pg_stat_file(current_setting('hba_file'))).modification AS hba_modified;
SELECT name,setting,source,pending_restart FROM pg_settings WHERE name IN
 ('password_encryption','ssl','listen_addresses','search_path','log_connections','log_statement','log_min_error_statement');
SELECT d.datname,d.datallowconn,pg_get_userbyid(d.datdba) AS owner,a.grantee,a.privilege_type,a.is_grantable
 FROM pg_database d CROSS JOIN LATERAL aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba))) a ORDER BY 1,4,5;
SELECT n.nspname,pg_get_userbyid(n.nspowner) AS owner,a.grantee,a.privilege_type
 FROM pg_namespace n LEFT JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a ON true
 WHERE n.nspname NOT LIKE 'pg_toast%' ORDER BY 1,3,4;
SELECT rolname,rolsuper,rolinherit,rolcreatedb,rolcreaterole,rolcanlogin,rolreplication,rolbypassrls
 FROM pg_roles WHERE rolname LIKE 'sigeh%';
SELECT roleid::regrole,member::regrole,admin_option,inherit_option,set_option FROM pg_auth_members;
SELECT n.nspname,c.relkind,pg_get_userbyid(c.relowner) AS owner,count(*) AS objects,
 count(*) FILTER (WHERE c.relacl IS NOT NULL) AS explicit_acl FROM pg_class c
 JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('sigeh','public') GROUP BY 1,2,3;
SELECT n.nspname,c.relname,a.attname,a.attacl FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('sigeh','public')
 AND a.attacl IS NOT NULL AND NOT a.attisdropped;
SELECT n.nspname,p.prosecdef,count(*) AS routines,count(*) FILTER (WHERE EXISTS
 (SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
 WHERE a.grantee=0 AND a.privilege_type='EXECUTE')) AS public_execute
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('sigeh','public') OR p.prosecdef GROUP BY 1,2;
SELECT defaclrole::regrole,defaclnamespace::regnamespace,defaclobjtype,defaclacl FROM pg_default_acl;
SELECT extname,extnamespace::regnamespace,extowner::regrole FROM pg_extension;
SELECT n.nspname,p.proname,p.oid::regprocedure FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='gen_random_uuid';
SELECT d.datname,s.setrole::regrole,x.setting FROM pg_db_role_setting s
 LEFT JOIN pg_database d ON d.oid=s.setdatabase CROSS JOIN LATERAL unnest(s.setconfig) x(setting)
 WHERE x.setting LIKE 'search_path=%';
SELECT n.nspname,c.relname,a.privilege_type FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault(
 CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) a
 WHERE n.nspname IN ('sigeh','public') AND a.grantee=0;

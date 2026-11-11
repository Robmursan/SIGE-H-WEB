/** Internal read contract; not advertised in OpenAPI until HTTP is authorized. */
export interface OrganizationItemDto {
  id: string;
  clave: string;
  nombre: string;
  hospitalId: string;
  divisionId: string | null;
  servicioId: string | null;
  zonaHoraria: string | null;
}

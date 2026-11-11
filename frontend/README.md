# SkillSwap AI — frontend integrado

El acceso normal usa React con la API Express y MySQL demo. Se conservan las pantallas y los estilos originales; los servicios del preview no se usan en el panel integrado.

Guía completa de configuración, arranque y pruebas manuales: [Integración y sustentación](../docs/INTEGRACION-Y-PRUEBAS-MANUALES.md).

```sh
npm ci --ignore-scripts
npm run dev -- --host localhost --port 5173 --strictPort
```

Usar `.env.local` a partir de `.env.example`, con `VITE_API_URL=http://localhost:4000/api` y `VITE_ENABLE_FRONTEND_PREVIEW=false`. No incluir secretos en variables VITE.

Verificaciones técnicas:

```sh
npm run build
npm run lint
npm test
```

Las pruebas automatizadas sustituyen fetch y los servicios externos por mocks. No equivalen a pruebas manuales de navegador. Las pantallas mentor/administrador y el preview local se conservan para una etapa posterior.

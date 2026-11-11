export function createMentorController(service) {
  const binary = async (response, value, disposition = 'attachment') => response.set({ 'Cache-Control': 'no-store',
    'Content-Type': value.mediaType, 'Content-Length': String(value.buffer.length),
    'Content-Disposition': disposition, 'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin', 'Content-Security-Policy': 'sandbox' }).status(200).send(value.buffer);
  return Object.freeze({
    requirements(request, response) { response.status(200).json({ requirements: service.requirements() }); },
    async catalog(request, response) { response.status(200).json({ skills: await service.catalog() }); },
    async ownSkills(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({ skills: await service.ownSkills(request.auth.user.id) });
    },
    async setOwnSkill(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({ skill: await service.setOwnSkill(
        request.auth.user.id, request.params.skillId, request.body) });
    },
    async applications(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({ applications: await service.applications(request.auth.user.id) });
    },
    async createApplication(request, response) {
      response.set('Cache-Control', 'no-store').status(201).json({ application: await service.createApplication(
        request.auth.user.id, request.multipart) });
    },
    async updateApplication(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({ application: await service.updateApplication(request.auth.user.id, request.params.applicationId, request.body) });
    },
    async replaceCertificate(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({ application: await service.replaceCertificate(
        request.auth.user.id, request.params.applicationId, request.multipart) });
    },
    async resubmit(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({ application: await service.resubmit(
        request.auth.user.id, request.params.applicationId, request.body) });
    },
    async document(request, response) {
      return binary(response, await service.document(request.auth.user.id,
        request.params.applicationId, request.params.type));
    },
    async savePhoto(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({ photo: await service.savePhoto(
        request.auth.user.id, request.multipart) });
    },
    async photo(request, response) { return binary(response, await service.photo(request.auth.user.id), 'inline'); },
    async deletePhoto(request, response) {
      response.set('Cache-Control', 'no-store').status(200).json({ photo: await service.deletePhoto(request.auth.user.id) });
    },
  });
}

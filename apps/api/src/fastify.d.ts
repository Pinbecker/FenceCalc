import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    sentryContext?: {
      sessionId: string;
      companyId: string;
      userId: string;
      userRole: string;
    };
  }
}

export {};
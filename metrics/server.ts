import path from 'node:path';
import fastifyCompress from '@fastify/compress';
import fastifyStatic from '@fastify/static';
import fastify from 'fastify';

/**
 * Running static server used by Lighthouse.
 */
type BenchmarkServer = {
	/**
	 * Origin serving the built application.
	 */
	origin: string;

	/**
	 * Stops the server after pending requests complete.
	 */
	close: () => Promise<void>;
};

/**
 * Starts the static benchmark server and waits until it is listening.
 *
 * @param   port   Local port exposed to Chromium.
 *
 * @returns        Running server handle.
 */
const startServer = async (port = 3000): Promise<BenchmarkServer> => {
	const server = fastify({ logger: false });

	await server.register(fastifyCompress);
	await server.register(fastifyStatic, {
		root: path.join(process.cwd(), 'dist'),
	});
	await server.listen({
		host: '127.0.0.1',
		port,
	});

	return {
		origin: `http://127.0.0.1:${port}`,
		close: () => server.close(),
	};
};

export { startServer };
export type { BenchmarkServer };

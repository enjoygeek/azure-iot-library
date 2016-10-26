/* Copyright (c) Microsoft Corporation. All Rights Reserved. */

import * as express from 'express';
import * as url from 'url';
import * as mustache from 'mustache';

import {LinkRelation, Rel, Verb} from './constants';
import {Response} from './response';
import {provides, hal} from './decorators';
import {Api} from './api';
import {Linker} from './linker';
import {Template} from './template';
import {Arguments} from './arguments';

// Resolve a relative href using the base path of an Express application
function relative(app: express.Application, href: string): string {
    return href && href[0] === '/' ? app.path().replace(/\/+$/, '') + href : href;
}

// Extract the path portion of an Express request
function path(req: express.Request): string {
    return url.parse(req.originalUrl).path!;
}

// Default template for automatic documentation
const template = '{{#routes}}<h1>{{href}}</h1>{{#methods}}<h2>{{verb}}</h2><p>{{options.description}}</p>{{/methods}}{{/routes}}';

// Provides functionality for embedding HAL server data in a given server object
export class Server {
    // Provide a global linker for cross-server registration
    static linker: Linker = new Linker();

    // Access the functional decorator representation for the target server or method;
    // this will typically be a prototype when called for a decorator and an instance otherwise
    static api(decorator: boolean, target: Object): Api.Class;
    static api(decorator: boolean, target: Object, method: string | symbol): Api.Method;
    static api(decorator: boolean, target: Object, method?: string | symbol): Api.Api {
        let api: Api.Api;
        if (!method) {
            if (!target.hasOwnProperty(Server.Class)) {
               target[Server.Class] = new Api.Class(target.constructor.name, decorator);
            }
            api = target[Server.Class];
        } else {
            const name = method.toString();
            if (!target.hasOwnProperty(Server.Methods)) {
                target[Server.Methods] = [];
            }
            api = target[Server.Methods].find((method: Api.Method) => method.name === name);
            if (!api) {
                api = new Api.Method(name, decorator);
                target[Server.Methods].push(api);
            }
        }
        return api;
    }
    
    // Generate an automated documentation Express handler for the given namespace
    private static autodoc(app: express.Application, ns: string, template: string): express.RequestHandler {
        return (req: express.Request, res: express.Response, next: express.NextFunction) => {
            // If a rel was not provided, this is not a valid documentation call
            const rel = req.params[Rel.Param];
            if (!rel) {
                res.sendStatus(404);
            }

            // For each possible route in the resolved rel, format the route and all available methods
            const routes = Server.linker.handle({}, ns + ':' + rel, (server: Object, route: string, links: Server.Link[]) => ({
                href: relative(app, route),
                methods: links.map(link => ({
                    verb: link.verb,
                    options: link
                }))
            }));

            // If no routes were found, assume this was not a valid rel
            if (routes.length > 0) {
                res.status(200).send(mustache.render(template, { ns, rel, routes }));
            } else {
                res.sendStatus(404);
            }
        };
    }

    // Register all data for a single handler method
    private static register(server: Object, handler: Server.Handler): express.RequestHandler[] {
        // Merge and normalize decorator arguments
        const route = {
            verb: Verb.stringify(handler.args.route[0].verb),
            path: handler.args.route[0].path
        };
        const hal = {
            links: new Set(handler.args.hal.reduce<Rel[]>((links, hal) => links.concat(hal.links), [])),
            options: handler.args.hal.reduce((options, hal) => Object.assign(options, hal.options), {}) as hal.Options
        };
        const middleware = handler.args.middleware.map(middleware => middleware.handler);
        const filter = handler.args.filter.map(filter => filter.filter);

        // If a self rel has been explicitly requested or this route requires an automatic default 'self' rel,
        // add it to the links
        if (hal.options.self || (typeof hal.options.self === 'undefined' && route.verb === 'GET')) {
            hal.links.add(LinkRelation.Self);
        }

        // Map the links back into an array for the handlers
        const links = Array.from(hal.links);

        // If this method provides rels, map them for quick access
        for (let provides of handler.args.provides) {
            let template = Template.apply(route.path, provides.options.params || {});
            Server.linker.registerLink(server, provides.rel, template, Object.assign({
                verb: route.verb,
                href: route.path,
                links
            }, provides.options));
        }

        // Bind the handlers in promises; Express does not use the return values of its handlers, 
        // and this allows us to properly catch error results from async methods (success results
        // are already supported via the next() or res callbacks)
        let handlers: express.RequestHandler[] = middleware.map(cb =>
            (req: express.Request, res: express.Response, next: express.NextFunction) =>
                Promise.resolve(cb(req, res, next)).catch(next));

        // If this is a HAL handler, add middleware that will transmute the response object into a HAL response
        handlers = handler.args.hal.length === 0 ? handlers : [
            (req: express.Request, res: express.Response, next: express.NextFunction) =>
                Response.create(server, path(req), links, req, res) && next()
        ].concat(handlers);

        // Generate middleware from the filter callbacks
        handlers = handlers.concat(filter.map(cb =>
            (req: express.Request, res: express.Response, next: express.NextFunction) =>
                Promise.resolve(cb(req)).then(ret => ret ? next() : next('route')).catch(next)));

        // Add the actual route handler method (supporting async, as above)
        handlers.push((req: express.Request, res: express.Response, next: express.NextFunction) =>
                Promise.resolve(server[handler.name](req, res, next)).catch(next));

        return handlers;
    }

    // Merge class and instance decorators to support prototype inheritance
    private static proto(target: Object): Arguments.Class & { methods: Api.Method[] } {
        let proto: Arguments.Class & { methods: Api.Method[] } = { provides: [], middleware: [], methods: [] };

        // Walk down the prototype chain and merge class decorators
        let prototype = target;
        while (prototype) {
            if (prototype.hasOwnProperty(Server.Class)) {
                proto.provides = proto.provides.concat(prototype[Server.Class][Arguments.Stack].provides);
                proto.middleware = proto.middleware.concat(prototype[Server.Class][Arguments.Stack].middleware);
            }
            if (prototype.hasOwnProperty(Server.Methods)) {
                proto.methods = proto.methods.concat(prototype[Server.Methods]);
            }
            prototype = Object.getPrototypeOf(prototype);
        }

        return proto;
    }

    // Obtain the Express application for the given server object
    static route(server: Object): express.Application {
        if (!server[Server.App]) {
            // If this is the first time this has been called, perform all necessary registration actions
            let app = server[Server.App] = express();

            const proto = Server.proto(server);

            // Resolve a default namespace if none was specified
            if (proto.provides.length === 0) {
                proto.provides.push({ namespace: server.constructor.name, options: {} });
            }

            // Resolve namespace documentation
            for (let provides of proto.provides) {
                const href = provides.options.href || `/docs/${provides.namespace}/:${Rel.Param}`;

                Server.linker.registerDocs(server, provides.namespace, href);

                // Register automatically-generated documentation
                if ((typeof provides.options.auto === 'undefined' && typeof provides.options.href === 'undefined') || provides.options.auto) {
                    app.get(Template.express(href), Server.autodoc(app, provides.namespace, provides.options.template || template));
                }
            }

            // Resolve server-wide middleware
            for (let middleware of proto.middleware.filter(middleware => !middleware.options.error)) {
                app.use(middleware.handler);
            }

            // Sort the methods into normalized route handlers
            let routes: Server.Route[] = [];
            for (let method of proto.methods) {
                for (let route of method[Arguments.Stack].route) {
                    routes.push({
                        verb: Verb.stringify(route.verb).toLowerCase(),
                        path: Template.express(route.path),
                        handler: { name: method.name, args: Object.assign({}, method[Arguments.Stack], { routes: [route] }) }
                    });
                }
            }
            
            // Register individual routes
            for (let route of routes) {
                if (app[route.verb]) {
                    app[route.verb].call(app, route.path, ...Server.register(server, route.handler));
                } else {
                    console.error(`${route.verb.toUpperCase()} is not a valid HTTP method.`);
                }
            }
            
            // Resolve server-wide error-handling middleware
            for (let middleware of proto.middleware.filter(middleware => middleware.options.error)) {
                app.use(middleware.handler);
            }

            // Ensure proper relative href resolution
            Server.linker.setDocsCallback(server, docs => {
                docs.href = relative(app, docs.href!);
                return docs;
            });
            Server.linker.setLinkCallback(server, link => {
                link.href = relative(app, link.href!);
                return link;
            });
        }
        
        return server[Server.App];
    }
    
    // An Express handler which provides HAL links to all discoverable routes
    static discovery(req: express.Request, res: express.Response, next: express.NextFunction) {
        const hal = Response.create({}, path(req), [], req, res);
        for (let server of Server.linker.servers()) {
            const proto = Server.proto(server);
            for (let methodName in proto.methods) {
                for (let provides of proto.methods[methodName][Arguments.Stack].provides) {
                    if (provides.options.discoverable) {
                        hal.link(provides.rel, { server });
                    }
                }
            }
        }
        hal.json({});
    };
}

export namespace Server {
    export interface Link extends hal.Overrides, provides.Options.Rel {
        verb?: string;
    }

    export interface Handler {
        name: string;
        args: Arguments.Method;
    }

    export interface Route {
        verb: string;
        path: string;
        handler: Handler;
    }

    export const App = Symbol();
    export const Class = Symbol();
    export const Methods = Symbol();
}

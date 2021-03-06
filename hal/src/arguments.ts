/* Copyright (c) Microsoft Corporation. All Rights Reserved. */

import * as express from 'express';

import {Rel, Verb, Href} from './constants';
import {provides, middleware, filter, hal} from './decorators';

// Provides interfaces for storing the arguments of the decorator callstacks
// NOTE: These should be aligned with the arguments of the decorators and the Api classes
export namespace Arguments {
    export interface Class {
        provides: Class.Provides[];
        middleware: Class.Middleware[];
    }

    export namespace Class {
        export interface Provides {
            namespace: string;
            options: provides.Options.Namespace;
        }
        export interface Middleware {
            handler: express.RequestHandler | express.ErrorRequestHandler;
            options: middleware.Options;
        }
    }

    export interface Method {
        route: Method.Route[];
        provides: Method.Provides[];
        middleware: Method.Middleware[];
        filter: Method.Filter[];
        hal: Method.Hal[];
    }

    export namespace Method {
        export interface Route {
            verb: Verb;
            path: Href;
        }
        export interface Provides {
            rel: Rel;
            options: provides.Options.Rel;
        }
        export interface Middleware {
            handler: express.RequestHandler;
        }
        export interface Filter {
            filter: filter.Filter;
        }
        export interface Hal {
            links: Rel[];
            options: hal.Options;
        }
    }

    export const Stack = Symbol();
}
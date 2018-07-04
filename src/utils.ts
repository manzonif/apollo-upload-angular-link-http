import {  HttpEvent, HttpClient, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';

import { Request } from './types';

export const fetch = (
    req: Request,
    httpClient: HttpClient,
): Observable<HttpEvent<Object>> => {
    const shouldUseBody =
        ['POST', 'PUT', 'PATCH'].indexOf(req.method.toUpperCase()) !== -1;
    const shouldStringify = (param: string) =>
        ['variables', 'extensions'].indexOf(param.toLowerCase()) !== -1;

    // `body` for some, `params` for others
    let bodyOrParams = {};

    if ((req.body as Body[]).length) {
        if (!shouldUseBody) {
            return new Observable(observer =>
                observer.error(new Error('Batching is not available for GET requests')),
            );
        }

        bodyOrParams = {
            body: req.body,
        };
    } else {
        if (shouldUseBody) {
            bodyOrParams = {};
        } else {
            Object.keys(req.body).forEach(param => {
                if (shouldStringify(param.toLowerCase())) {
                    (req.body as any)[param] = JSON.stringify((req.body as any)[param]);
                }
            });

            bodyOrParams = { params: req.body };
        }
    }
    const _req = new HttpRequest(req.method, req.url, req.body, {
        responseType: 'json',
        reportProgress: true, 
        ...req.options,
        ...bodyOrParams,
    });

    // create a request
    return httpClient.request(_req);
};


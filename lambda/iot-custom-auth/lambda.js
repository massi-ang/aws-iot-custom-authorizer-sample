'use strict'

exports.handler = async function (event, context) {
    console.debug(event)
    let token = undefined
    if (event.protocolData !== undefined) {
        const queryString = event.protocolData.http.queryString
        const params = new URLSearchParams(queryString);
        token = params.get("token")
    }

    if (token === undefined) {
        console.debug('Trying to get the token from the payload')
        token = event.token
    }
    if (token === undefined) {
        console.warn("Cannot find any token in the request")
        return buildPolicy(null, false)
    }
    console.debug(`token : ${token}`)
    var tokenParts = token.split('.')
    if (tokenParts.length !== 2) {
        return buildPolicy(null, false)
    }
    var jwtBuffer = new Buffer.from(tokenParts[1], 'base64')
    try {
        var jwtToken = JSON.parse(jwtBuffer.toString())

        if (!jwtToken.exp || Math.floor(jwtToken.exp/1000) > Date.now() ) {
            console.warn('Expired token')
            return buildPolicy(null, false)
        }
        if (!jwtToken.sub) {
            console.warn('Missing sub')
            return buildPolicy(null, false)
        }
        // Based on the token one should still verify that the user is
        // authorized using jwtToken.sub
        return buildPolicy(jwtToken, true)
    } catch (err) {
        console.error('Invalid token')
        return buildPolicy(null, false)
    }
}

function buildPolicy (token, authenticated) {
    if (authenticated) { 
        return {
            context: {},
            isAuthenticated: true,
            principalId: `${token.sub.replace(/[^a-zA-Z0-9]/gi, '')}`, // Make sure the principalId is valid
            disconnectAfterInSeconds: 86400,
            refreshAfterInSeconds: 600,
            policyDocuments: [
                {
                    Version: "2012-10-17",
                    Statement: [  
                        {
                            "Action": "iot:Connect",
                            "Effect": "Allow",
                            "Resource": "*" // Should also restrict the client id to match a thing name
                        },
                        {
                            "Action": "iot:Subscribe",
                            "Effect": "Allow",
                            "Resource": [
                                `arn:aws:iot:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT}:topicfilter/d/${token.sub}`,
                                `arn:aws:iot:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT}:topicfilter/$aws/things/${token.sub}/shadow/get/accepted`
                            ]
                        },
                        {
                            "Action": ["iot:Receive", "iot:Publish"], // Publish permission of d/<id> only for testing
                            "Effect": "Allow",
                            "Resource": [
                                `arn:aws:iot:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT}:topic/d/${token.sub}`,
                                `arn:aws:iot:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT}:topic/$aws/things/${token.sub}/shadow/get`,
                                `arn:aws:iot:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT}:topic/$aws/things/${token.sub}/shadow/get/accepted`
                            ]
                        }
                    ]
                }
            ] 
        }
    } else {
        return {
            isAuthenticated: false,
            principalId: "custom",
            disconnectAfterInSeconds: 0,
            refreshAfterInSeconds: 0,
            context: {},
            policyDocuments: []
        }
    }
}

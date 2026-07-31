ARG SOURCE_DATE_EPOCH=0
FROM gcr.io/distroless/nodejs24-debian13@sha256:af85d11ce7ef10172855a6e3649e3e8125b1b9e3ca41849ec2918036f05cb212

USER 0:0
RUN ["/nodejs/bin/node","-e","require('node:fs').mkdirSync('/usr/local/bin',{recursive:true});require('node:fs').symlinkSync('/nodejs/bin/node','/usr/local/bin/node')"]

COPY wrapper.mjs /opt/eden/wrapper.mjs

USER 65532:65532
WORKDIR /workspace
ENTRYPOINT ["/nodejs/bin/node","/opt/eden/wrapper.mjs"]

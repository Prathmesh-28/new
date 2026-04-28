from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework import serializers
from apps.core.models import User


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["email"] = user.email
        token["role"] = user.role
        token["tenant_id"] = str(user.tenant_id)
        token["organisation_name"] = user.tenant.name
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = {
            "id": str(self.user.id),
            "email": self.user.email,
            "role": self.user.role,
            "full_name": self.user.full_name,
            "organisation_id": str(self.user.tenant_id),
            "organisation_name": self.user.tenant.name,
        }
        return data


class UserSerializer(serializers.ModelSerializer):
    organisation_id = serializers.UUIDField(source="tenant_id", read_only=True)
    organisation_name = serializers.CharField(source="tenant.name", read_only=True)

    class Meta:
        model = User
        fields = ("id", "email", "full_name", "role", "status", "organisation_id", "organisation_name")
        read_only_fields = fields


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    organisation_name = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ("email", "password", "full_name", "organisation_name")

    def create(self, validated_data):
        from apps.core.models import Tenant
        org_name = validated_data.pop("organisation_name")
        password = validated_data.pop("password")
        tenant, _ = Tenant.objects.get_or_create(name=org_name)
        user = User.objects.create_user(
            tenant=tenant,
            password=password,
            **validated_data,
        )
        return user
